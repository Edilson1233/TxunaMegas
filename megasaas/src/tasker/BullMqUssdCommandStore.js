import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { UssdCommand } from './UssdCommand.js';
import { UssdCommandStore } from './UssdCommandStore.js';

const DEFAULT_QUEUE_NAME = 'megasaas:ussd-commands';
const JOB_NAME = 'ussd-command';

/**
 * BullMqUssdCommandStore
 * ----------------------
 * Adaptador persistente da fila USSD sobre BullMQ/Redis.
 *
 * A execucao continua a ser por polling do MacroDroid/Tasker. BullMQ entra
 * aqui como armazenamento persistente/partilhado para os comandos enquanto a
 * app ainda nao tem workers USSD internos.
 */
export class BullMqUssdCommandStore extends UssdCommandStore {
  #queue;
  #connection;
  #ownsQueue;
  #ownsConnection;

  constructor({
    queue = null,
    connection = null,
    redisUrl = 'redis://localhost:6379',
    queueName = DEFAULT_QUEUE_NAME,
  } = {}) {
    super();
    if (queue) {
      this.#queue = queue;
      this.#connection = connection;
      this.#ownsQueue = false;
      this.#ownsConnection = false;
      return;
    }

    this.#connection = connection ?? new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.#queue = new Queue(queueName, { connection: this.#connection });
    this.#ownsQueue = true;
    this.#ownsConnection = !connection;
  }

  async save(command) {
    const data = serializeCommand(command);
    const existing = await this.#queue.getJob(command.id);

    if (existing) {
      await existing.updateData(data);
      return toCommand(data);
    }

    const job = await this.#queue.add(JOB_NAME, data, {
      jobId: command.id,
      removeOnComplete: false,
      removeOnFail: false,
    });
    return toCommand(job.data);
  }

  async get(commandId) {
    const job = await this.#queue.getJob(commandId);
    return job ? toCommand(job.data) : null;
  }

  async delete(commandId) {
    const removed = await this.#queue.remove(commandId, { removeChildren: true });
    return removed > 0;
  }

  async list() {
    const jobs = await this.#queue.getJobs(['waiting', 'delayed', 'prioritized', 'active'], 0, -1, true);
    return jobs.map((job) => toCommand(job.data)).sort(compareCommands);
  }

  async close() {
    if (this.#ownsQueue) {
      await this.#queue.close();
    }
    if (this.#ownsConnection && this.#connection) {
      await this.#connection.quit();
    }
  }
}

function serializeCommand(command) {
  return {
    id: command.id,
    transactionId: command.transactionId,
    contextKey: command.contextKey,
    destinationNumber: command.destinationNumber,
    amount: command.amount,
    paymentAmount: command.paymentAmount,
    deliveryAmount: command.deliveryAmount,
    status: command.status,
    createdAt: command.createdAt,
    dispatchedAt: command.dispatchedAt,
    attemptCount: command.attemptCount,
    lastError: command.lastError,
  };
}

function toCommand(data) {
  return new UssdCommand(data);
}

function compareCommands(left, right) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return String(left.id).localeCompare(String(right.id));
}

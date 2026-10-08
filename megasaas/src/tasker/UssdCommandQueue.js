import { randomUUID } from 'node:crypto';
import { UssdCommand, UssdCommandStatus } from './UssdCommand.js';
import { UssdEvents } from './UssdEvents.js';
import { InMemoryUssdCommandStore } from './InMemoryUssdCommandStore.js';

const DEFAULT_DISPATCH_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 1;

/**
 * UssdCommandQueue
 * ------------------
 * Fila de comandos USSD pendentes de execução pelo Tasker.
 *
 * RISCO CONHECIDO (documentado, igual ao padrão das fases anteriores):
 * por defeito usa InMemoryUssdCommandStore, que perde dados com reinício do
 * processo. A Fase 7 troca o store por persistência/fila real.
 */
export class UssdCommandQueue {
  #store;
  #eventBus;
  #logger;
  #dispatchTimeoutMs;
  #maxAttempts;

  constructor({
    store = new InMemoryUssdCommandStore(),
    eventBus,
    logger,
    dispatchTimeoutMs = DEFAULT_DISPATCH_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {}) {
    this.#store = store;
    this.#eventBus = eventBus;
    this.#logger = logger;
    this.#dispatchTimeoutMs =
      Number.isFinite(dispatchTimeoutMs) && dispatchTimeoutMs > 0 ? dispatchTimeoutMs : DEFAULT_DISPATCH_TIMEOUT_MS;
    this.#maxAttempts = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : DEFAULT_MAX_ATTEMPTS;
  }

  async enqueue({ transactionId, contextKey, destinationNumber, amount = null, paymentAmount = null, deliveryAmount = null }) {
    const command = new UssdCommand({
      id: randomUUID(),
      transactionId,
      contextKey,
      destinationNumber,
      amount,
      paymentAmount,
      deliveryAmount,
    });
    await this.#store.save(command);
    this.#logger?.info(
      { commandId: command.id, transactionId, destinationNumber },
      '[UssdCommandQueue] comando USSD colocado na fila'
    );
    return command;
  }

  /** Chamado pelo endpoint que o Tasker usa para pedir o próximo trabalho. */
  async dequeueNext() {
    for (const command of await this.#store.list()) {
      if (command.status === UssdCommandStatus.PENDING) {
        command.status = UssdCommandStatus.DISPATCHED;
        command.attemptCount += 1;
        command.dispatchedAt = new Date().toISOString();
        await this.#store.save(command);
        this.#eventBus?.emit(UssdEvents.DISPATCHED, { command });
        return command;
      }
    }
    return null;
  }

  /** Chamado pelo endpoint de confirmação (sucesso ou falha da execução). */
  async ack(commandId, { success, details = null }) {
    const command = await this.#store.get(commandId);
    if (!command) return null;

    command.status = success ? UssdCommandStatus.COMPLETED : UssdCommandStatus.FAILED;
    await this.#store.delete(commandId);

    const eventName = success ? UssdEvents.COMPLETED : UssdEvents.FAILED;
    this.#eventBus?.emit(eventName, { command, details });
    return command;
  }

  async ackMatchingTransfer({ transaction, details = 'SMS Transferiste confirmou execucao USSD' }) {
    for (const command of await this.#store.list()) {
      if (command.status !== UssdCommandStatus.DISPATCHED) continue;
      if (Number(command.paymentAmount) !== Number(transaction.amount) && Number(command.deliveryAmount) !== Number(transaction.amount)) continue;
      if (!samePhone(command.destinationNumber, transaction.counterpartyPhone)) continue;

      return this.ack(command.id, { success: true, details });
    }

    return null;
  }

  async checkTimedOut(now = Date.now()) {
    const affected = [];

    for (const command of await this.#store.list()) {
      if (command.status !== UssdCommandStatus.DISPATCHED) continue;

      const dispatchedAt = Date.parse(command.dispatchedAt);
      if (Number.isNaN(dispatchedAt) || now - dispatchedAt < this.#dispatchTimeoutMs) continue;

      command.lastError = 'USSD command acknowledgement timed out';
      affected.push(command);

      if (command.attemptCount < this.#maxAttempts) {
        command.status = UssdCommandStatus.PENDING;
        command.dispatchedAt = null;
        await this.#store.save(command);
        this.#logger?.warn(
          {
            commandId: command.id,
            transactionId: command.transactionId,
            attemptCount: command.attemptCount,
            maxAttempts: this.#maxAttempts,
          },
          '[UssdCommandQueue] comando USSD expirou sem ACK; recolocado na fila'
        );
        continue;
      }

      command.status = UssdCommandStatus.TIMED_OUT;
      await this.#store.delete(command.id);
      this.#logger?.error(
        {
          commandId: command.id,
          transactionId: command.transactionId,
          attemptCount: command.attemptCount,
        },
        '[UssdCommandQueue] comando USSD expirou sem ACK; tentativa final falhou'
      );
      this.#eventBus?.emit(UssdEvents.FAILED, { command, details: command.lastError });
    }

    return affected;
  }
}

function samePhone(left, right) {
  const normalizedLeft = normalizeMzPhone(left);
  const normalizedRight = normalizeMzPhone(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizeMzPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('258')) return digits.slice(3);
  return digits;
}

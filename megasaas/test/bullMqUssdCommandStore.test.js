import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BullMqUssdCommandStore } from '../src/tasker/BullMqUssdCommandStore.js';
import { UssdCommand, UssdCommandStatus } from '../src/tasker/UssdCommand.js';

test('BullMqUssdCommandStore persiste comandos usando Queue injetada', async () => {
  const queue = new FakeBullMqQueue();
  const store = new BullMqUssdCommandStore({ queue });
  const command = new UssdCommand({
    id: 'cmd-1',
    transactionId: 'TX1',
    contextKey: 'chat1',
    destinationNumber: '859253929',
    paymentAmount: 15,
    deliveryAmount: 600,
  });

  await store.save(command);

  const stored = await store.get('cmd-1');
  assert.equal(stored.id, 'cmd-1');
  assert.equal(stored.paymentAmount, 15);
  assert.equal(stored.deliveryAmount, 600);
  assert.equal(stored.amount, 600);
});

test('BullMqUssdCommandStore atualiza dados de job existente', async () => {
  const queue = new FakeBullMqQueue();
  const store = new BullMqUssdCommandStore({ queue });
  const command = new UssdCommand({
    id: 'cmd-1',
    transactionId: 'TX1',
    contextKey: 'chat1',
    destinationNumber: '859253929',
    amount: 600,
  });

  await store.save(command);
  command.status = UssdCommandStatus.DISPATCHED;
  command.attemptCount = 1;
  command.dispatchedAt = '2026-10-08T00:00:00.000Z';
  await store.save(command);

  const stored = await store.get('cmd-1');
  assert.equal(stored.status, UssdCommandStatus.DISPATCHED);
  assert.equal(stored.attemptCount, 1);
  assert.equal(stored.dispatchedAt, '2026-10-08T00:00:00.000Z');
});

test('BullMqUssdCommandStore lista por ordem de criacao e remove comandos', async () => {
  const queue = new FakeBullMqQueue();
  const store = new BullMqUssdCommandStore({ queue });
  const second = new UssdCommand({
    id: 'cmd-2',
    transactionId: 'TX2',
    contextKey: 'chat2',
    amount: 30,
    createdAt: '2026-10-08T00:00:02.000Z',
  });
  const first = new UssdCommand({
    id: 'cmd-1',
    transactionId: 'TX1',
    contextKey: 'chat1',
    amount: 15,
    createdAt: '2026-10-08T00:00:01.000Z',
  });

  await store.save(second);
  await store.save(first);

  assert.deepEqual((await store.list()).map((command) => command.id), ['cmd-1', 'cmd-2']);
  assert.equal(await store.delete('cmd-1'), true);
  assert.equal(await store.get('cmd-1'), null);
  assert.deepEqual((await store.list()).map((command) => command.id), ['cmd-2']);
});

class FakeBullMqQueue {
  #jobs = new Map();

  async add(_name, data, options) {
    const job = new FakeBullMqJob(options.jobId, data);
    this.#jobs.set(options.jobId, job);
    return job;
  }

  async getJob(jobId) {
    return this.#jobs.get(jobId);
  }

  async getJobs() {
    return [...this.#jobs.values()];
  }

  async remove(jobId) {
    return this.#jobs.delete(jobId) ? 1 : 0;
  }
}

class FakeBullMqJob {
  constructor(id, data) {
    this.id = id;
    this.data = data;
  }

  async updateData(data) {
    this.data = data;
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UssdCommandQueue } from '../src/tasker/UssdCommandQueue.js';
import { UssdCommandStatus } from '../src/tasker/UssdCommand.js';
import { UssdEvents } from '../src/tasker/UssdEvents.js';
import { InMemoryUssdCommandStore } from '../src/tasker/InMemoryUssdCommandStore.js';

test('enqueue adiciona comando em PENDING', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  assert.equal(command.status, UssdCommandStatus.PENDING);
});

test('enqueue usa store injetado pela fila USSD', async () => {
  const store = new InMemoryUssdCommandStore();
  const queue = new UssdCommandQueue({ store });

  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });

  assert.equal(await store.get(command.id), command);
});

test('dequeueNext devolve o comando pendente e marca DISPATCHED', async () => {
  const queue = new UssdCommandQueue({});
  await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const dequeued = await queue.dequeueNext();
  assert.equal(dequeued.status, UssdCommandStatus.DISPATCHED);
  assert.equal(dequeued.attemptCount, 1);
});

test('dequeueNext devolve null quando nao ha comandos pendentes', async () => {
  const queue = new UssdCommandQueue({});
  assert.equal(await queue.dequeueNext(), null);
});

test('ack marca COMPLETED em sucesso e remove da fila', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const acked = await queue.ack(command.id, { success: true });
  assert.equal(acked.status, UssdCommandStatus.COMPLETED);
  assert.equal(await queue.dequeueNext(), null);
});

test('ack marca FAILED em insucesso', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const acked = await queue.ack(command.id, { success: false, details: 'USSD timeout' });
  assert.equal(acked.status, UssdCommandStatus.FAILED);
});

test('ack devolve null para commandId desconhecido', async () => {
  const queue = new UssdCommandQueue({});
  assert.equal(await queue.ack('nao-existe', { success: true }), null);
});

test('ackMatchingTransfer completa comando DISPATCHED que bate com valor e destino', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '850108639', amount: 100 });

  await queue.dequeueNext();
  const acked = await queue.ackMatchingTransfer({
    transaction: { amount: 100, counterpartyPhone: '258850108639' },
  });

  assert.equal(acked.id, command.id);
  assert.equal(acked.status, UssdCommandStatus.COMPLETED);
  assert.equal(await queue.dequeueNext(), null);
});

test('ackMatchingTransfer ignora comando quando valor ou destino nao batem', async () => {
  const queue = new UssdCommandQueue({});
  await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '850108639', amount: 100 });

  await queue.dequeueNext();
  const acked = await queue.ackMatchingTransfer({
    transaction: { amount: 90, counterpartyPhone: '258850108639' },
  });

  assert.equal(acked, null);
});

test('enqueue separa valor pago e megas a entregar mantendo amount como alias de deliveryAmount', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({
    transactionId: 'TX1',
    contextKey: 'chat1',
    destinationNumber: '850108639',
    paymentAmount: 15,
    deliveryAmount: 600,
  });

  assert.equal(command.paymentAmount, 15);
  assert.equal(command.deliveryAmount, 600);
  assert.equal(command.amount, 600);
});

test('checkTimedOut marca comando DISPATCHED como TIMED_OUT depois do timeout final', async () => {
  const emitted = [];
  const queue = new UssdCommandQueue({
    dispatchTimeoutMs: 10,
    maxAttempts: 1,
    eventBus: { emit: (eventName, payload) => emitted.push({ eventName, payload }) },
  });
  await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });

  const command = await queue.dequeueNext();
  const now = Date.now();
  command.dispatchedAt = new Date(now - 11).toISOString();
  const affected = await queue.checkTimedOut(now);

  assert.equal(affected.length, 1);
  assert.equal(command.status, UssdCommandStatus.TIMED_OUT);
  assert.equal(command.lastError, 'USSD command acknowledgement timed out');
  assert.equal(emitted.at(-1).eventName, UssdEvents.FAILED);
  assert.equal(await queue.dequeueNext(), null);
});

test('checkTimedOut recoloca comando na fila quando ainda ha tentativas configuradas', async () => {
  const queue = new UssdCommandQueue({ dispatchTimeoutMs: 10, maxAttempts: 2 });
  await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });

  const firstDispatch = await queue.dequeueNext();
  const now = Date.now();
  firstDispatch.dispatchedAt = new Date(now - 11).toISOString();
  await queue.checkTimedOut(now);

  assert.equal(firstDispatch.status, UssdCommandStatus.PENDING);
  assert.equal(firstDispatch.attemptCount, 1);

  const secondDispatch = await queue.dequeueNext();
  assert.equal(secondDispatch.id, firstDispatch.id);
  assert.equal(secondDispatch.status, UssdCommandStatus.DISPATCHED);
  assert.equal(secondDispatch.attemptCount, 2);
});

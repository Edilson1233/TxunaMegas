import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UssdCommandQueue } from '../src/tasker/UssdCommandQueue.js';
import { UssdCommandStatus } from '../src/tasker/UssdCommand.js';

test('enqueue adiciona comando em PENDING', () => {
  const queue = new UssdCommandQueue({});
  const command = queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  assert.equal(command.status, UssdCommandStatus.PENDING);
});

test('dequeueNext devolve o comando pendente e marca DISPATCHED', () => {
  const queue = new UssdCommandQueue({});
  queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const dequeued = queue.dequeueNext();
  assert.equal(dequeued.status, UssdCommandStatus.DISPATCHED);
});

test('dequeueNext devolve null quando não há comandos pendentes', () => {
  const queue = new UssdCommandQueue({});
  assert.equal(queue.dequeueNext(), null);
});

test('ack marca COMPLETED em sucesso e remove da fila', () => {
  const queue = new UssdCommandQueue({});
  const command = queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const acked = queue.ack(command.id, { success: true });
  assert.equal(acked.status, UssdCommandStatus.COMPLETED);
  assert.equal(queue.dequeueNext(), null);
});

test('ack marca FAILED em insucesso', () => {
  const queue = new UssdCommandQueue({});
  const command = queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const acked = queue.ack(command.id, { success: false, details: 'USSD timeout' });
  assert.equal(acked.status, UssdCommandStatus.FAILED);
});

test('ack devolve null para commandId desconhecido', () => {
  const queue = new UssdCommandQueue({});
  assert.equal(queue.ack('nao-existe', { success: true }), null);
});

test('ackMatchingTransfer completa comando DISPATCHED que bate com valor e destino', () => {
  const queue = new UssdCommandQueue({});
  const command = queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '850108639', amount: 100 });

  queue.dequeueNext();
  const acked = queue.ackMatchingTransfer({
    transaction: { amount: 100, counterpartyPhone: '258850108639' },
  });

  assert.equal(acked.id, command.id);
  assert.equal(acked.status, UssdCommandStatus.COMPLETED);
  assert.equal(queue.dequeueNext(), null);
});

test('ackMatchingTransfer ignora comando quando valor ou destino nao batem', () => {
  const queue = new UssdCommandQueue({});
  queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '850108639', amount: 100 });

  queue.dequeueNext();
  const acked = queue.ackMatchingTransfer({
    transaction: { amount: 90, counterpartyPhone: '258850108639' },
  });

  assert.equal(acked, null);
});

test('enqueue separa valor pago e megas a entregar mantendo amount como alias de deliveryAmount', () => {
  const queue = new UssdCommandQueue({});
  const command = queue.enqueue({
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

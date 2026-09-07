import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events/EventBus.js';
import { PendingTransactionManager } from '../src/core/transactions/PendingTransactionManager.js';
import { InMemoryPendingTransactionStore } from '../src/core/transactions/InMemoryPendingTransactionStore.js';
import { TransactionEvents } from '../src/core/transactions/TransactionEvents.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';
import { TransactionType } from '../src/core/dto/TransactionType.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function buildTransaction(source) {
  return new Transaction({
    tenantId: '11111111-1111-1111-1111-111111111111',
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DFT1KNIBSBZ',
    amount: 210,
    destinationNumber: source === TransactionSource.WHATSAPP_TEXT ? '859253929' : null,
    source,
  });
}

test('PendingTransactionManager delega claim ao Core quando cliente esta configurado', async () => {
  const calls = [];
  const manager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus: new EventBus({ logger: silentLogger }),
    logger: silentLogger,
    corePaymentClient: {
      async registerPaymentClaim(payload) {
        calls.push(payload);
        return { decision: 'PENDING_VERIFICATION' };
      },
    },
  });

  const result = await manager.registerClaim(buildTransaction(TransactionSource.WHATSAPP_TEXT), {
    contextKey: 'chat1',
    whatsappInstanceId: 'default-instance',
    messageId: 'msg-1',
  });

  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contextKey, 'chat1');
  assert.equal(calls[0].whatsappInstanceId, 'default-instance');
});

test('PendingTransactionManager emite CLAIM_VERIFIED com contextKey devolvido pelo Core', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  let emitted;
  eventBus.on(TransactionEvents.CLAIM_VERIFIED, (evt) => {
    emitted = evt;
  });

  const manager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
    corePaymentClient: {
      async registerSmsConfirmation() {
        return {
          decision: 'VERIFIED',
          tenantId: '11111111-1111-1111-1111-111111111111',
          contextKey: 'chat1',
          externalTransactionId: 'DFT1KNIBSBZ',
          amount: 210,
          destinationNumber: '859253929',
        };
      },
    },
  });

  const result = await manager.resolveWithRealTransaction(buildTransaction(TransactionSource.TASKER_SMS), {
    deviceId: '22222222-2222-2222-2222-222222222222',
    rawSms: 'sms',
    reportedAt: new Date().toISOString(),
  });

  assert.equal(result.verified, true);
  assert.equal(result.transaction.source, TransactionSource.TASKER_SMS);
  assert.equal(result.transaction.destinationNumber, '859253929');
  assert.equal(emitted.contextKey, 'chat1');
  assert.equal(emitted.verification.transaction.externalTransactionId, 'DFT1KNIBSBZ');
});

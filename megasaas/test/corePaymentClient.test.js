import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CorePaymentClient } from '../src/core/api/CorePaymentClient.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';
import { TransactionType } from '../src/core/dto/TransactionType.js';

const parsedPayment = Object.freeze({
  matched: true,
  warnings: [],
  parserVersion: '1.1.0',
});

function buildTransaction(source = TransactionSource.WHATSAPP_TEXT) {
  return new Transaction({
    tenantId: '11111111-1111-1111-1111-111111111111',
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DFT1KNIBSBZ',
    amount: 210,
    destinationNumber: '859253929',
    source,
  });
}

test('CorePaymentClient envia claim com autenticacao, idempotencia e payload canonico', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ decision: 'PENDING_VERIFICATION' }), { status: 200 });
  };

  try {
    const client = new CorePaymentClient({ baseUrl: 'http://localhost:8080/', token: 'core-token' });
    const response = await client.registerPaymentClaim({
      transaction: buildTransaction(),
      parsedPayment,
      contextKey: 'chat1',
      whatsappInstanceId: 'default-instance',
      chatType: 'PRIVATE',
      chatId: 'chat1',
      messageId: 'msg-1',
      rawMessageText: 'raw',
      receivedAt: '2026-09-04T00:00:00.000Z',
    });

    assert.equal(response.decision, 'PENDING_VERIFICATION');
    assert.equal(captured.url, 'http://localhost:8080/internal/v1/payment-claims');
    assert.equal(captured.options.headers.Authorization, 'Bearer core-token');
    assert.equal(captured.options.headers['Content-Type'], 'application/json');
    assert.match(captured.options.headers['Idempotency-Key'], /^[a-f0-9]{64}$/);
    assert.equal(captured.body.tenantId, '11111111-1111-1111-1111-111111111111');
    assert.equal(captured.body.whatsappInstanceId, 'default-instance');
    assert.equal(captured.body.parsedPayment.source, TransactionSource.WHATSAPP_TEXT);
    assert.equal(captured.body.parsedPayment.externalTransactionId, 'DFT1KNIBSBZ');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CorePaymentClient envia confirmacao SMS sem mudar o contrato antigo do MacroDroid', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ decision: 'ORPHAN_CONFIRMATION_ACCEPTED' }), { status: 200 });
  };

  try {
    const client = new CorePaymentClient({ baseUrl: 'http://localhost:8080', token: 'core-token' });
    await client.registerSmsConfirmation({
      transaction: buildTransaction(TransactionSource.TASKER_SMS),
      parsedPayment,
      deviceId: '22222222-2222-2222-2222-222222222222',
      rawSms: 'sms',
      reportedAt: '2026-09-04T00:00:00.000Z',
    });

    assert.equal(captured.url, 'http://localhost:8080/internal/v1/payment-confirmations/sms');
    assert.equal(captured.body.deviceId, '22222222-2222-2222-2222-222222222222');
    assert.equal(captured.body.rawSms, 'sms');
    assert.equal(captured.body.parsedPayment.source, TransactionSource.TASKER_SMS);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

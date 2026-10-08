import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSmsReport, handleNextCommand, handleCommandAck, normalizeTaskerTimestamp } from '../src/tasker/taskerHandlers.js';
import { TenantContext } from '../src/core/dto/TenantContext.js';
import { PendingTransactionManager } from '../src/core/transactions/PendingTransactionManager.js';
import { InMemoryPendingTransactionStore } from '../src/core/transactions/InMemoryPendingTransactionStore.js';
import { EventBus } from '../src/core/events/EventBus.js';
import { UssdCommandQueue } from '../src/tasker/UssdCommandQueue.js';
import { UssdEvents } from '../src/tasker/UssdEvents.js';
import { createTaskerServer } from '../src/tasker/server.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';
import { TransactionType } from '../src/core/dto/TransactionType.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
const tenantContext = TenantContext.resolveForInstance('default-instance');
const REAL_SMS =
  'Confirmado DFT1KNIBSBZ. Recebeste 210.00MT de 258846227063 - Paulo Marcelino Chivinge ' +
  'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100.';
const TRANSFER_SENT_SMS =
  'Confirmado DHQ6LCATVGF. Transferiste 100.00MT e a taxa foi de 0.00MT para 850108639 - Cliente Teste ' +
  'aos 30/6/26 as 2:18 AM. O teu novo saldo M-Pesa e de 500.00MT. Continua a transferir SEM TAXAS de M-Pesa para M-Pesa.';

function makeManager() {
  const eventBus = new EventBus({ logger: silentLogger });
  return new PendingTransactionManager({ store: new InMemoryPendingTransactionStore(), eventBus, logger: silentLogger });
}

test('handleSmsReport aceita SMS válida que confirma alegação pendente', async () => {
  const pendingTransactionManager = makeManager();
  const claim = new Transaction({
    tenantId: tenantContext.tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DFT1KNIBSBZ',
    amount: 210,
    source: TransactionSource.WHATSAPP_TEXT,
  });
  await pendingTransactionManager.registerClaim(claim, { contextKey: 'chat1' });

  const result = await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 210, rawSms: REAL_SMS, timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager,
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.status, 'ACCEPTED');
});

test('handleSmsReport rejeita payload incompleto', async () => {
  const result = await handleSmsReport({ body: { transactionId: 'X' }, tenantContext, pendingTransactionManager: makeManager() });
  assert.equal(result.httpStatus, 400);
  assert.equal(result.body.reason, 'INVALID_PAYLOAD');
});

test('handleSmsReport rejeita timestamp antigo (anti-replay)', async () => {
  const result = await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 210, rawSms: REAL_SMS, timestamp: new Date(Date.now() - 10 * 60_000).toISOString() },
    tenantContext,
    pendingTransactionManager: makeManager(),
  });
  assert.equal(result.httpStatus, 400);
  assert.equal(result.body.reason, 'STALE_TIMESTAMP');
});

test('handleSmsReport rejeita SMS não reconhecida pelo parser', async () => {
  const result = await handleSmsReport({
    body: { transactionId: 'X', amount: 10, rawSms: 'texto qualquer', timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager: makeManager(),
  });
  assert.equal(result.httpStatus, 422);
  assert.equal(result.body.reason, 'UNPARSEABLE_SMS');
});

test('handleSmsReport rejeita quando payload não bate com o que o parser extraiu', async () => {
  const result = await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 999, rawSms: REAL_SMS, timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager: makeManager(),
  });
  assert.equal(result.httpStatus, 422);
  assert.equal(result.body.reason, 'PAYLOAD_MISMATCH');
});

test('handleSmsReport aceita SMS sem alegação pendente correspondente (transação órfã)', async () => {
  const result = await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 210, rawSms: REAL_SMS, timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager: makeManager(),
  });
  assert.equal(result.httpStatus, 202);
  assert.equal(result.body.note, 'SEM_ALEGACAO_PENDENTE');
});

test('correção real: SMS chega ANTES da mensagem do WhatsApp — cruzamento acontece na alegação seguinte', async () => {
  const pendingTransactionManager = makeManager();

  // 1º: a SMS real chega primeiro (ordem comum na vida real).
  const smsResult = await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 210, rawSms: REAL_SMS, timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager,
  });
  assert.equal(smsResult.body.note, 'SEM_ALEGACAO_PENDENTE'); // ainda fica órfã, não perdida

  // 2º: a alegação do WhatsApp chega depois — deve cruzar de imediato.
  const claim = new Transaction({
    tenantId: tenantContext.tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DFT1KNIBSBZ',
    amount: 210,
    source: TransactionSource.WHATSAPP_TEXT,
  });
  const verification = await pendingTransactionManager.registerClaim(claim, { contextKey: 'chat1' });

  assert.equal(verification.verified, true);
  assert.equal(verification.transaction.externalTransactionId, 'DFT1KNIBSBZ');
});

test('handleSmsReport rejeita transactionId já usado (idempotência ponta-a-ponta)', async () => {
  const pendingTransactionManager = makeManager();
  const claim1 = new Transaction({
    tenantId: tenantContext.tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DFT1KNIBSBZ',
    amount: 210,
    source: TransactionSource.WHATSAPP_TEXT,
  });
  await pendingTransactionManager.registerClaim(claim1, { contextKey: 'chat1' });
  await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 210, rawSms: REAL_SMS, timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager,
  });

  const claim2 = new Transaction({
    tenantId: tenantContext.tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DFT1KNIBSBZ',
    amount: 210,
    source: TransactionSource.WHATSAPP_TEXT,
  });
  const secondClaimResult = await pendingTransactionManager.registerClaim(claim2, { contextKey: 'chat2' });
  assert.equal(secondClaimResult.reason, 'ALREADY_USED');
});

test('handleNextCommand devolve 204 quando não há comandos', async () => {
  const queue = new UssdCommandQueue({});
  const result = await handleNextCommand({ ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 204);
});

test('handleNextCommand devolve o comando pendente', async () => {
  const queue = new UssdCommandQueue({});
  await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const result = await handleNextCommand({ ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.destinationNumber, '859253929');
});

test('handleNextCommand devolve amount como megas a digitar no USSD', async () => {
  const queue = new UssdCommandQueue({});
  await queue.enqueue({
    transactionId: 'TX1',
    contextKey: 'chat1',
    destinationNumber: '859253929',
    paymentAmount: 15,
    deliveryAmount: 600,
  });
  const result = await handleNextCommand({ ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.paymentAmount, 15);
  assert.equal(result.body.deliveryAmount, 600);
  assert.equal(result.body.amount, 600);
  assert.equal(result.body.attemptCount, 1);
});

test('handleCommandAck marca sucesso corretamente', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const result = await handleCommandAck({ commandId: command.id, body: { success: true }, ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 200);
});

test('handleCommandAck aceita success por query param', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const result = await handleCommandAck({ commandId: command.id, query: { success: 'true' }, ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 200);
});

test('handleCommandAck rejeita ACK sem success explicito', async () => {
  const queue = new UssdCommandQueue({});
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '859253929', amount: 15 });
  const result = await handleCommandAck({ commandId: command.id, body: {}, ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 400);
});

test('handleCommandAck devolve 404 para commandId inexistente', async () => {
  const queue = new UssdCommandQueue({});
  const result = await handleCommandAck({ commandId: 'nao-existe', body: { success: true }, ussdCommandQueue: queue });
  assert.equal(result.httpStatus, 404);
});

test('handleSmsReport usa SMS Transferiste para confirmar comando USSD despachado', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  const queue = new UssdCommandQueue({ eventBus, logger: silentLogger });
  const command = await queue.enqueue({ transactionId: 'TX1', contextKey: 'chat1', destinationNumber: '850108639', amount: 100 });
  let completedCommand = null;
  eventBus.on(UssdEvents.COMPLETED, ({ command: completed }) => {
    completedCommand = completed;
  });

  await queue.dequeueNext();
  const result = await handleSmsReport({
    body: { rawSms: TRANSFER_SENT_SMS, timestamp: new Date().toISOString() },
    tenantContext,
    pendingTransactionManager: makeManager(),
    ussdCommandQueue: queue,
  });

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.note, 'USSD_COMMAND_CONFIRMED');
  assert.equal(completedCommand.id, command.id);
});

test('normalizeTaskerTimestamp converte timestamp local do MacroDroid para ISO com offset', () => {
  assert.equal(normalizeTaskerTimestamp('2026-10-08 17:58:21'), '2026-10-08T17:58:21+02:00');
});

test('normalizeTaskerTimestamp preserva timestamps ISO validos', () => {
  assert.equal(normalizeTaskerTimestamp('2026-09-04T00:00:00.000Z'), '2026-09-04T00:00:00.000Z');
});

test('handleSmsReport envia timestamp normalizado ao Core', async () => {
  let capturedOptions = null;
  const macroDroidTimestamp = new Date(Date.now() + 2 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  const result = await handleSmsReport({
    body: { transactionId: 'DFT1KNIBSBZ', amount: 210, rawSms: REAL_SMS, timestamp: macroDroidTimestamp },
    tenantContext,
    pendingTransactionManager: {
      async resolveWithRealTransaction(_transaction, options) {
        capturedOptions = options;
        return null;
      },
    },
  });

  assert.equal(result.httpStatus, 202);
  assert.match(capturedOptions.reportedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+02:00$/);
});

test('TaskerServer devolve 502 em erro interno sem derrubar o processo Node', async () => {
  const app = createTaskerServer({
    tenantContext,
    pendingTransactionManager: {
      async resolveWithRealTransaction() {
        throw new Error('Core indisponivel');
      },
    },
    ussdCommandQueue: null,
    logger: silentLogger,
    apiKey: 'secret',
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/tasker/sms`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionId: 'DFT1KNIBSBZ',
        amount: 210,
        rawSms: REAL_SMS,
        timestamp: new Date().toISOString(),
      }),
    });

    assert.equal(response.status, 502);
    assert.equal((await response.json()).reason, 'UPSTREAM_ERROR');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

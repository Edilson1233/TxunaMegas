import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events/EventBus.js';
import { WhatsAppEvents } from '../src/whatsapp/events/WhatsAppEvents.js';
import { SessionManager } from '../src/core/session/SessionManager.js';
import { InMemorySessionStore } from '../src/core/session/InMemorySessionStore.js';
import { PendingTransactionManager } from '../src/core/transactions/PendingTransactionManager.js';
import { InMemoryPendingTransactionStore } from '../src/core/transactions/InMemoryPendingTransactionStore.js';
import { UssdCommandQueue } from '../src/tasker/UssdCommandQueue.js';
import { PurchaseFlowCoordinator } from '../src/flow/PurchaseFlowCoordinator.js';
import { TenantContext } from '../src/core/dto/TenantContext.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { MpesaParser } from '../src/mpesa/MpesaParser.js';
import { StaticPriceTable } from '../src/core/pricing/StaticPriceTable.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
const PAYMENT_15MT =
  'Confirmado DHQ6LCATV15. Recebeste 15.00MT de 258846227063 - Cliente Teste ' +
  'aos 30/6/26 as 2:18 AM. O teu novo saldo M-Pesa e de 800.00MT. Em caso de duvida, liga 100. 850108639';

test('pagamento de 15MT gera comando USSD com 600MB quando tabela temporaria esta configurada', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  const sessionManager = new SessionManager({ store: new InMemorySessionStore() });
  const pendingTransactionManager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
  });
  const ussdCommandQueue = new UssdCommandQueue({ eventBus, logger: silentLogger });
  const tenantContext = TenantContext.resolveForInstance('default-instance');
  const priceTable = StaticPriceTable.fromEnv('15:600');

  const coordinator = new PurchaseFlowCoordinator({
    eventBus,
    sessionManager,
    pendingTransactionManager,
    ussdCommandQueue,
    tenantContext,
    logger: silentLogger,
    priceTable,
  });
  coordinator.start();

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: PAYMENT_15MT });
  await new Promise((resolve) => setImmediate(resolve));

  const parsed = MpesaParser.parse(PAYMENT_15MT);
  const realTransaction = Transaction.fromParserResult(parsed, {
    tenantContext,
    source: TransactionSource.TASKER_SMS,
  });
  await pendingTransactionManager.resolveWithRealTransaction(realTransaction);
  await new Promise((resolve) => setImmediate(resolve));

  const command = ussdCommandQueue.dequeueNext();
  assert.equal(command.paymentAmount, 15);
  assert.equal(command.deliveryAmount, 600);
  assert.equal(command.amount, 600);
});

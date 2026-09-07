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
import { SessionState } from '../src/core/session/SessionState.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
const REAL_SMS =
  'Confirmado DFT1KNIBSBY. Recebeste 210.00MT de 258846227063 - Paulo Marcelino Chivinge ' +
  'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100. 843112233';

test('nova mensagem M-Pesa durante PROCESSING nao reinicia verificacao', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  const sessionManager = new SessionManager({ store: new InMemorySessionStore() });
  const pendingTransactionManager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
  });
  const ussdCommandQueue = new UssdCommandQueue({ eventBus, logger: silentLogger });
  const tenantContext = TenantContext.resolveForInstance('default-instance');

  const coordinator = new PurchaseFlowCoordinator({
    eventBus,
    sessionManager,
    pendingTransactionManager,
    ussdCommandQueue,
    tenantContext,
    logger: silentLogger,
  });
  coordinator.start();

  await sessionManager.transition('chat1', SessionState.AWAITING_VERIFICATION, {
    currentTransactionId: 'DFT1KNIBSBZ',
  });
  await sessionManager.transition('chat1', SessionState.PROCESSING);

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.PROCESSING);
  assert.equal(session.currentTransactionId, 'DFT1KNIBSBZ');
});

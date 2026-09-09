import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events/EventBus.js';
import { SessionManager } from '../src/core/session/SessionManager.js';
import { InMemorySessionStore } from '../src/core/session/InMemorySessionStore.js';
import { PendingTransactionManager } from '../src/core/transactions/PendingTransactionManager.js';
import { InMemoryPendingTransactionStore } from '../src/core/transactions/InMemoryPendingTransactionStore.js';
import { UssdCommandQueue } from '../src/tasker/UssdCommandQueue.js';
import { PurchaseFlowCoordinator } from '../src/flow/PurchaseFlowCoordinator.js';
import { TenantContext } from '../src/core/dto/TenantContext.js';
import { SessionState } from '../src/core/session/SessionState.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

test('timeout final de comando USSD emite falha e desbloqueia sessao em processamento', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  const sessionManager = new SessionManager({ store: new InMemorySessionStore() });
  const pendingTransactionManager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
  });
  const ussdCommandQueue = new UssdCommandQueue({
    eventBus,
    logger: silentLogger,
    dispatchTimeoutMs: 10,
    maxAttempts: 1,
  });
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
    currentTransactionId: 'TX1',
  });
  await sessionManager.transition('chat1', SessionState.PROCESSING);
  ussdCommandQueue.enqueue({
    transactionId: 'TX1',
    contextKey: 'chat1',
    destinationNumber: '859253929',
    paymentAmount: 15,
    deliveryAmount: 600,
  });

  const command = ussdCommandQueue.dequeueNext();
  const now = Date.now();
  command.dispatchedAt = new Date(now - 11).toISOString();
  ussdCommandQueue.checkTimedOut(now);
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.NOT_FOUND);
});

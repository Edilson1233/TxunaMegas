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
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';
import { TransactionType } from '../src/core/dto/TransactionType.js';
import { MpesaParser } from '../src/mpesa/MpesaParser.js';
import { SessionState } from '../src/core/session/SessionState.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
// Inclui número de destino explícito no fim — os testes deste ficheiro são
// sobre verificação/USSD/expiração, não sobre o pedido de número em falta
// (esse tem testes dedicados mais abaixo).
const REAL_SMS =
  'Confirmado DFT1KNIBSBZ. Recebeste 210.00MT de 258846227063 - Paulo Marcelino Chivinge ' +
  'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100. 843112233';

function setup({ claimTimeoutMs, orphanTimeoutMs } = {}) {
  const eventBus = new EventBus({ logger: silentLogger });
  const sessionManager = new SessionManager({ store: new InMemorySessionStore() });
  const pendingTransactionManager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
    claimTimeoutMs,
    orphanTimeoutMs,
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

  return { eventBus, sessionManager, pendingTransactionManager, ussdCommandQueue, tenantContext };
}

function buildRealTransaction(tenantContext) {
  // Construída da mesma forma que o fluxo real (Fase 5): via MpesaParser,
  // não campos escolhidos à mão — garante que counterpartyPhone (usado
  // como fallback de destinationNumber) está presente, tal como na prática.
  const parsed = MpesaParser.parse(REAL_SMS);
  return Transaction.fromParserResult(parsed, { tenantContext, source: TransactionSource.TASKER_SMS });
}

test('mensagem M-Pesa real leva a sessão a AWAITING_VERIFICATION', async () => {
  const { eventBus, sessionManager } = setup();
  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);
  assert.equal(session.currentTransactionId, 'DFT1KNIBSBZ');
});

test('mensagem irrelevante não altera a sessão', async () => {
  const { eventBus, sessionManager } = setup();
  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: 'na boa' });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.IDLE);
});

test('ciclo completo: alegação -> verificação real positiva -> PROCESSING', async () => {
  const { eventBus, sessionManager, pendingTransactionManager, tenantContext } = setup();
  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  await pendingTransactionManager.resolveWithRealTransaction(buildRealTransaction(tenantContext));
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.PROCESSING);
});

test('ciclo completo: alegação -> expira -> NOT_FOUND', async () => {
  const { eventBus, sessionManager, pendingTransactionManager } = setup({ claimTimeoutMs: 30 });
  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  await new Promise((resolve) => setTimeout(resolve, 50));
  await pendingTransactionManager.checkExpired();
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.NOT_FOUND);
});

test('correção de bug real: duas SMS M-Pesa seguidas no mesmo contextKey não derrubam o processo', async () => {
  const { eventBus, sessionManager } = setup();
  const SEGUNDA_SMS = REAL_SMS.replace('DFT1KNIBSBZ', 'DFT1KNIBSBY');

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));
  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: SEGUNDA_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);
  assert.equal(session.currentTransactionId, 'DFT1KNIBSBY');
});

test('Fase 5 — ciclo ponta-a-ponta: verificação -> comando USSD -> ack sucesso -> COMPLETED', async () => {
  const { eventBus, sessionManager, pendingTransactionManager, tenantContext, ussdCommandQueue } = setup();

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  await pendingTransactionManager.resolveWithRealTransaction(buildRealTransaction(tenantContext));
  await new Promise((resolve) => setImmediate(resolve));

  const command = ussdCommandQueue.dequeueNext();
  assert.ok(command, 'comando USSD devia ter sido enfileirado ao verificar com sucesso');
  // REAL_SMS já inclui um número de destino explícito no fim.
  assert.equal(command.destinationNumber, '843112233');

  ussdCommandQueue.ack(command.id, { success: true });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.COMPLETED);
});

test('Fase 5 — ciclo ponta-a-ponta: falha na execução do USSD leva a NOT_FOUND (escalar suporte)', async () => {
  const { eventBus, sessionManager, pendingTransactionManager, tenantContext, ussdCommandQueue } = setup();

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  await pendingTransactionManager.resolveWithRealTransaction(buildRealTransaction(tenantContext));
  await new Promise((resolve) => setImmediate(resolve));

  const command = ussdCommandQueue.dequeueNext();
  ussdCommandQueue.ack(command.id, { success: false, details: 'USSD timeout' });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.NOT_FOUND);
});

test('Fase 5 — número de destino explícito no texto do cliente é respeitado no comando USSD', async () => {
  const { eventBus, pendingTransactionManager, tenantContext, ussdCommandQueue } = setup();
  const SMS_SEM_DESTINO_EMBUTIDO =
    'Confirmado DFT1KNIBSBZ. Recebeste 210.00MT de 258846227063 - Paulo Marcelino Chivinge ' +
    'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100.';
  const SMS_COM_DESTINO = SMS_SEM_DESTINO_EMBUTIDO + ' 859253929';

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: SMS_COM_DESTINO });
  await new Promise((resolve) => setImmediate(resolve));

  await pendingTransactionManager.resolveWithRealTransaction(buildRealTransaction(tenantContext));
  await new Promise((resolve) => setImmediate(resolve));

  const command = ussdCommandQueue.dequeueNext();
  assert.equal(command.destinationNumber, '859253929');
});

test('correção real: SMS real chega ANTES da mensagem do WhatsApp — sessão ainda assim chega a PROCESSING', async () => {
  const { eventBus, sessionManager, pendingTransactionManager, tenantContext, ussdCommandQueue } = setup();

  // A SMS real chega primeiro — sem nenhuma sessão ainda a existir para 'chat1'.
  await pendingTransactionManager.resolveWithRealTransaction(buildRealTransaction(tenantContext));

  const beforeClaim = await sessionManager.getOrCreate('chat1');
  assert.equal(beforeClaim.state, SessionState.IDLE); // nada perdido, mas também nada ainda ligado a este chat

  // Só depois é que o cliente escreve a mensagem no WhatsApp.
  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.PROCESSING); // cruzamento imediato, sem esperar por nenhum evento

  const command = ussdCommandQueue.dequeueNext();
  assert.ok(command, 'comando USSD devia ter sido enfileirado no cruzamento imediato');
});

test('Fase 5 — respostas reais são enviadas ao WhatsApp em cada etapa do fluxo completo', async () => {
  const eventBus = new EventBus({ logger: silentLogger });
  const sessionManager = new SessionManager({ store: new InMemorySessionStore() });
  const pendingTransactionManager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
  });
  const ussdCommandQueue = new UssdCommandQueue({ eventBus, logger: silentLogger });
  const tenantContext = TenantContext.resolveForInstance('default-instance');

  const sentMessages = [];
  const fakeWhatsAppProvider = {
    async sendText(chatId, text) {
      sentMessages.push({ chatId, text });
    },
  };

  const coordinator = new PurchaseFlowCoordinator({
    eventBus,
    sessionManager,
    pendingTransactionManager,
    ussdCommandQueue,
    tenantContext,
    logger: silentLogger,
    whatsAppProvider: fakeWhatsAppProvider,
  });
  coordinator.start();

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: REAL_SMS });
  await new Promise((resolve) => setImmediate(resolve));

  await pendingTransactionManager.resolveWithRealTransaction(buildRealTransaction(tenantContext));
  await new Promise((resolve) => setImmediate(resolve));

  const command = ussdCommandQueue.dequeueNext();
  ussdCommandQueue.ack(command.id, { success: true });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sentMessages.length, 2); // "pedido recebido" + "megas transferidos"
  assert.equal(sentMessages[0].chatId, 'chat1');
  assert.match(sentMessages[0].text, /Pedido recebido/i);
  assert.match(sentMessages[0].text, /DFT1KNIBSBZ/);
  assert.match(sentMessages[1].text, /transferidos automaticamente/i);
});

test('correção real: cliente esquece o número de destino — bot pede, cliente responde, fluxo prossegue', async () => {
  const { eventBus, sessionManager, pendingTransactionManager, ussdCommandQueue } = setup();
  const SMS_SEM_DESTINO =
    'Confirmado DHQ6LCATVGM. Recebeste 510.00MT de 258846227063 - Edilson Paulo Chivinge ' +
    'aos 30/6/26 as 2:18 AM. O teu novo saldo M-Pesa e de 800.00MT. Em caso de duvida, liga 100.';

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: SMS_SEM_DESTINO });
  await new Promise((resolve) => setImmediate(resolve));

  let session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.AWAITING_DESTINATION_NUMBER);

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: '859253929' });
  await new Promise((resolve) => setImmediate(resolve));

  session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.AWAITING_VERIFICATION);

  const realTransaction = new Transaction({
    tenantId: TenantContext.resolveForInstance('default-instance').tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: 'DHQ6LCATVGM',
    amount: 510,
    source: TransactionSource.TASKER_SMS,
  });
  await pendingTransactionManager.resolveWithRealTransaction(realTransaction);
  await new Promise((resolve) => setImmediate(resolve));

  const command = ussdCommandQueue.dequeueNext();
  assert.ok(command);
  assert.equal(command.destinationNumber, '859253929');
});

test('correção real: número de destino inválido é rejeitado e o bot pede outra vez', async () => {
  const { eventBus, sessionManager } = setup();
  const SMS_SEM_DESTINO =
    'Confirmado DHQ6LCATVGM. Recebeste 510.00MT de 258846227063 - Edilson Paulo Chivinge ' +
    'aos 30/6/26 as 2:18 AM. O teu novo saldo M-Pesa e de 800.00MT. Em caso de duvida, liga 100.';

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: SMS_SEM_DESTINO });
  await new Promise((resolve) => setImmediate(resolve));

  eventBus.emit(WhatsAppEvents.MESSAGE_RECEIVED, { contextKey: 'chat1', text: 'não sei o número' });
  await new Promise((resolve) => setImmediate(resolve));

  const session = await sessionManager.getOrCreate('chat1');
  assert.equal(session.state, SessionState.AWAITING_DESTINATION_NUMBER); // continua à espera
});

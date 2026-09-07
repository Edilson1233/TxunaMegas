import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events/EventBus.js';
import { TransactionEvents } from '../src/core/transactions/TransactionEvents.js';
import { PendingTransactionManager } from '../src/core/transactions/PendingTransactionManager.js';
import { InMemoryPendingTransactionStore } from '../src/core/transactions/InMemoryPendingTransactionStore.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';
import { TransactionType } from '../src/core/dto/TransactionType.js';
import { TenantContext } from '../src/core/dto/TenantContext.js';
import { PaymentVerificationReason } from '../src/core/dto/PaymentVerification.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
const tenant = TenantContext.resolveForInstance('default-instance');

function buildTransaction({ id, amount, source }) {
  return new Transaction({
    tenantId: tenant.tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: id,
    amount,
    source,
  });
}

function makeManager({ claimTimeoutMs, orphanTimeoutMs } = {}) {
  const eventBus = new EventBus({ logger: silentLogger });
  const manager = new PendingTransactionManager({
    store: new InMemoryPendingTransactionStore(),
    eventBus,
    logger: silentLogger,
    claimTimeoutMs,
    orphanTimeoutMs,
  });
  return { manager, eventBus };
}

test('registerClaim regista alegação válida como pendente (devolve null)', async () => {
  const { manager } = makeManager();
  const claim = buildTransaction({ id: 'TX1', amount: 100, source: TransactionSource.WHATSAPP_TEXT });

  const result = await manager.registerClaim(claim, { contextKey: 'chat1' });
  assert.equal(result, null);
});

test('registerClaim rejeita imediatamente alegação sem transactionId', async () => {
  const { manager } = makeManager();
  const claim = buildTransaction({ id: null, amount: 100, source: TransactionSource.WHATSAPP_TEXT });

  const result = await manager.registerClaim(claim, { contextKey: 'chat1' });
  assert.equal(result.verified, false);
  assert.equal(result.reason, PaymentVerificationReason.NOT_FOUND);
});

test('registerClaim rejeita transactionId já usado (idempotência)', async () => {
  const { manager } = makeManager();
  const claim1 = buildTransaction({ id: 'TX1', amount: 100, source: TransactionSource.WHATSAPP_TEXT });
  const real = buildTransaction({ id: 'TX1', amount: 100, source: TransactionSource.TASKER_SMS });

  await manager.registerClaim(claim1, { contextKey: 'chat1' });
  await manager.resolveWithRealTransaction(real); // marca TX1 como usado

  const claim2 = buildTransaction({ id: 'TX1', amount: 100, source: TransactionSource.WHATSAPP_TEXT });
  const result = await manager.registerClaim(claim2, { contextKey: 'chat2' });

  assert.equal(result.verified, false);
  assert.equal(result.reason, PaymentVerificationReason.ALREADY_USED);
});

test('resolveWithRealTransaction confirma quando valor bate certo', async () => {
  const { manager, eventBus } = makeManager();
  const claim = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.WHATSAPP_TEXT });
  const real = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.TASKER_SMS });

  let emitted = null;
  eventBus.on(TransactionEvents.CLAIM_VERIFIED, (evt) => (emitted = evt));

  await manager.registerClaim(claim, { contextKey: 'chat1' });
  const verification = await manager.resolveWithRealTransaction(real);

  assert.equal(verification.verified, true);
  assert.equal(verification.transaction.externalTransactionId, 'TX1');
  assert.equal(emitted.contextKey, 'chat1');
});

test('resolveWithRealTransaction rejeita quando valor não bate certo', async () => {
  const { manager } = makeManager();
  const claim = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.WHATSAPP_TEXT });
  const real = buildTransaction({ id: 'TX1', amount: 50, source: TransactionSource.TASKER_SMS });

  await manager.registerClaim(claim, { contextKey: 'chat1' });
  const verification = await manager.resolveWithRealTransaction(real);

  assert.equal(verification.verified, false);
  assert.equal(verification.reason, PaymentVerificationReason.AMOUNT_MISMATCH);
});

test('resolveWithRealTransaction devolve null se não houver alegação pendente para esse id', async () => {
  const { manager } = makeManager();
  const real = buildTransaction({ id: 'TX_SEM_ALEGACAO', amount: 50, source: TransactionSource.TASKER_SMS });

  const verification = await manager.resolveWithRealTransaction(real);
  assert.equal(verification, null);
});

test('checkExpired rejeita alegações mais antigas que o timeout configurado', async () => {
  const { manager, eventBus } = makeManager({ claimTimeoutMs: 30 });
  const claim = buildTransaction({ id: 'TX1', amount: 100, source: TransactionSource.WHATSAPP_TEXT });

  let emitted = null;
  eventBus.on(TransactionEvents.CLAIM_EXPIRED, (evt) => (emitted = evt));

  await manager.registerClaim(claim, { contextKey: 'chat1' });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const expired = await manager.checkExpired();

  assert.equal(expired.length, 1);
  assert.equal(expired[0].reason, PaymentVerificationReason.NOT_FOUND);
  assert.equal(emitted.contextKey, 'chat1');
});

test('checkExpired não afeta alegações ainda dentro do prazo', async () => {
  const { manager } = makeManager({ claimTimeoutMs: 60_000 });
  const claim = buildTransaction({ id: 'TX1', amount: 100, source: TransactionSource.WHATSAPP_TEXT });

  await manager.registerClaim(claim, { contextKey: 'chat1' });
  const expired = await manager.checkExpired();

  assert.equal(expired.length, 0);
});

test('correção real: SMS órfã sobrevive ao prazo curto de "claim" — só expira no seu próprio prazo, mais longo', async () => {
  // Prazo de alegação curtíssimo (propositado, para o teste ser rápido) e
  // prazo de órfã bem mais longo — reproduz exatamente o problema
  // reportado: usar o mesmo prazo para os dois lados descartava a SMS
  // demasiado cedo, antes de o cliente ter tempo de escrever no WhatsApp.
  const { manager } = makeManager({ claimTimeoutMs: 30, orphanTimeoutMs: 60_000 });
  const real = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.TASKER_SMS });

  await manager.resolveWithRealTransaction(real); // fica órfã
  await new Promise((resolve) => setTimeout(resolve, 50)); // passa o prazo de "claim", mas não o de "orphan"

  await manager.checkExpired();

  // A alegação do WhatsApp chega só agora — a SMS órfã TEM de continuar lá.
  const claim = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.WHATSAPP_TEXT });
  const verification = await manager.registerClaim(claim, { contextKey: 'chat1' });

  assert.equal(verification.verified, true);
});

test('correção de bug real: registerClaim NÃO emite CLAIM_VERIFIED ao cruzar com órfã (evitava duplicação)', async () => {
  const { manager, eventBus } = makeManager();
  let emittedCount = 0;
  eventBus.on(TransactionEvents.CLAIM_VERIFIED, () => {
    emittedCount += 1;
  });

  const real = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.TASKER_SMS });
  await manager.resolveWithRealTransaction(real); // fica órfã, sem alegação ainda

  const claim = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.WHATSAPP_TEXT });
  const result = await manager.registerClaim(claim, { contextKey: 'chat1' });

  assert.equal(result.verified, true); // o chamador recebe o resultado diretamente...
  assert.equal(emittedCount, 0); // ...e o evento não dispara — só o valor devolvido é usado aqui
});

test('resolveWithRealTransaction continua a emitir CLAIM_VERIFIED exatamente uma vez (caminho normal)', async () => {
  const { manager, eventBus } = makeManager();
  let emittedCount = 0;
  eventBus.on(TransactionEvents.CLAIM_VERIFIED, () => {
    emittedCount += 1;
  });

  const claim = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.WHATSAPP_TEXT });
  await manager.registerClaim(claim, { contextKey: 'chat1' });

  const real = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.TASKER_SMS });
  await manager.resolveWithRealTransaction(real);

  assert.equal(emittedCount, 1); // este caminho PRECISA do evento — é o único acesso do Tasker ao coordinator
});

test('SMS órfã expira depois do seu próprio prazo, se ninguém reclamar', async () => {
  const { manager } = makeManager({ orphanTimeoutMs: 30 });
  const real = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.TASKER_SMS });

  await manager.resolveWithRealTransaction(real);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await manager.checkExpired();

  const claim = buildTransaction({ id: 'TX1', amount: 210, source: TransactionSource.WHATSAPP_TEXT });
  const verification = await manager.registerClaim(claim, { contextKey: 'chat1' });

  assert.equal(verification, null); // já não há órfã — fica pendente como alegação nova
});

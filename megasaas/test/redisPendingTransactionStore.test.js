import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedisPendingTransactionStore } from '../src/core/transactions/RedisPendingTransactionStore.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';
import { TransactionType } from '../src/core/dto/TransactionType.js';
import { TenantContext } from '../src/core/dto/TenantContext.js';

const tenant = TenantContext.resolveForInstance('default-instance');

test('RedisPendingTransactionStore guarda e lista alegacoes pendentes', async () => {
  const redis = new FakeRedis();
  const store = new RedisPendingTransactionStore({ redis });
  const transaction = buildTransaction({
    id: 'TX1',
    amount: 100,
    source: TransactionSource.WHATSAPP_TEXT,
    destinationNumber: '850108639',
  });

  await store.set('TX1', { transaction, contextKey: 'chat1', registeredAt: 1000 });

  const stored = await store.get('TX1');
  assert.equal(stored.contextKey, 'chat1');
  assert.equal(stored.registeredAt, 1000);
  assert.ok(stored.transaction instanceof Transaction);
  assert.equal(stored.transaction.externalTransactionId, 'TX1');
  assert.equal(stored.transaction.destinationNumber, '850108639');
  assert.deepEqual((await store.listPending()).map((entry) => entry.transaction.externalTransactionId), ['TX1']);

  await store.delete('TX1');
  assert.equal(await store.get('TX1'), null);
  assert.deepEqual(await store.listPending(), []);
});

test('RedisPendingTransactionStore guarda SMS real orfa e idempotencia usada', async () => {
  const redis = new FakeRedis();
  const store = new RedisPendingTransactionStore({ redis });
  const transaction = buildTransaction({
    id: 'TX2',
    amount: 50,
    source: TransactionSource.TASKER_SMS,
  });

  await store.setOrphanReal('TX2', { transaction, registeredAt: 2000 });
  assert.equal(await store.isUsed('TX2'), false);

  const orphan = await store.getOrphanReal('TX2');
  assert.ok(orphan.transaction instanceof Transaction);
  assert.equal(orphan.transaction.source, TransactionSource.TASKER_SMS);
  assert.deepEqual((await store.listOrphanReal()).map((entry) => entry.externalTransactionId), ['TX2']);

  await store.markUsed('TX2');
  assert.equal(await store.isUsed('TX2'), true);

  await store.deleteOrphanReal('TX2');
  assert.equal(await store.getOrphanReal('TX2'), null);
  assert.deepEqual(await store.listOrphanReal(), []);
});

function buildTransaction({ id, amount, source, destinationNumber = null }) {
  return new Transaction({
    tenantId: tenant.tenantId,
    provider: PaymentProvider.MPESA,
    type: TransactionType.RECEIVED,
    externalTransactionId: id,
    amount,
    destinationNumber,
    source,
  });
}

class FakeRedis {
  #values = new Map();
  #sets = new Map();

  async get(key) {
    return this.#values.get(key) ?? null;
  }

  async set(key, value) {
    this.#values.set(key, value);
    return 'OK';
  }

  async del(key) {
    const existed = this.#values.delete(key);
    this.#sets.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key) {
    return this.#values.has(key) || this.#sets.has(key) ? 1 : 0;
  }

  async sadd(key, value) {
    if (!this.#sets.has(key)) {
      this.#sets.set(key, new Set());
    }
    const set = this.#sets.get(key);
    const before = set.size;
    set.add(value);
    return set.size - before;
  }

  async srem(key, value) {
    const set = this.#sets.get(key);
    return set?.delete(value) ? 1 : 0;
  }

  async smembers(key) {
    return [...(this.#sets.get(key) ?? [])];
  }

  async quit() {}
}

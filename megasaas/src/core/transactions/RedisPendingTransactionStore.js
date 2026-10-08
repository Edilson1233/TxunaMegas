import IORedis from 'ioredis';
import { Transaction } from '../dto/Transaction.js';
import { PendingTransactionStore } from './PendingTransactionStore.js';

const DEFAULT_NAMESPACE = 'megasaas:pending-transactions';

export class RedisPendingTransactionStore extends PendingTransactionStore {
  #redis;
  #ownsRedis;
  #namespace;

  constructor({
    redis = null,
    redisUrl = 'redis://localhost:6379',
    namespace = DEFAULT_NAMESPACE,
  } = {}) {
    super();
    this.#redis = redis ?? new IORedis(redisUrl);
    this.#ownsRedis = !redis;
    this.#namespace = namespace;
  }

  async get(externalTransactionId) {
    const raw = await this.#redis.get(this.#pendingKey(externalTransactionId));
    return raw ? toPendingEntry(JSON.parse(raw)) : null;
  }

  async set(externalTransactionId, entry) {
    await this.#redis.set(this.#pendingKey(externalTransactionId), JSON.stringify(serializePendingEntry(entry)));
    await this.#redis.sadd(this.#pendingIndexKey(), externalTransactionId);
    return entry;
  }

  async delete(externalTransactionId) {
    await this.#redis.del(this.#pendingKey(externalTransactionId));
    await this.#redis.srem(this.#pendingIndexKey(), externalTransactionId);
  }

  async listPending() {
    const ids = await this.#redis.smembers(this.#pendingIndexKey());
    const entries = [];

    for (const id of ids.sort()) {
      const entry = await this.get(id);
      if (entry) {
        entries.push(entry);
      } else {
        await this.#redis.srem(this.#pendingIndexKey(), id);
      }
    }

    return entries;
  }

  async isUsed(externalTransactionId) {
    return (await this.#redis.exists(this.#usedKey(externalTransactionId))) === 1;
  }

  async markUsed(externalTransactionId) {
    await this.#redis.set(this.#usedKey(externalTransactionId), '1');
  }

  async getOrphanReal(externalTransactionId) {
    const raw = await this.#redis.get(this.#orphanKey(externalTransactionId));
    return raw ? toOrphanEntry(JSON.parse(raw)) : null;
  }

  async setOrphanReal(externalTransactionId, entry) {
    await this.#redis.set(this.#orphanKey(externalTransactionId), JSON.stringify(serializeOrphanEntry(entry)));
    await this.#redis.sadd(this.#orphanIndexKey(), externalTransactionId);
    return entry;
  }

  async deleteOrphanReal(externalTransactionId) {
    await this.#redis.del(this.#orphanKey(externalTransactionId));
    await this.#redis.srem(this.#orphanIndexKey(), externalTransactionId);
  }

  async listOrphanReal() {
    const ids = await this.#redis.smembers(this.#orphanIndexKey());
    const entries = [];

    for (const id of ids.sort()) {
      const entry = await this.getOrphanReal(id);
      if (entry) {
        entries.push({ externalTransactionId: id, ...entry });
      } else {
        await this.#redis.srem(this.#orphanIndexKey(), id);
      }
    }

    return entries;
  }

  async close() {
    if (this.#ownsRedis) {
      await this.#redis.quit();
    }
  }

  #pendingKey(externalTransactionId) {
    return `${this.#namespace}:pending:${externalTransactionId}`;
  }

  #pendingIndexKey() {
    return `${this.#namespace}:pending:index`;
  }

  #usedKey(externalTransactionId) {
    return `${this.#namespace}:used:${externalTransactionId}`;
  }

  #orphanKey(externalTransactionId) {
    return `${this.#namespace}:orphan-real:${externalTransactionId}`;
  }

  #orphanIndexKey() {
    return `${this.#namespace}:orphan-real:index`;
  }
}

function serializePendingEntry(entry) {
  return {
    transaction: serializeTransaction(entry.transaction),
    contextKey: entry.contextKey,
    registeredAt: entry.registeredAt,
  };
}

function serializeOrphanEntry(entry) {
  return {
    transaction: serializeTransaction(entry.transaction),
    registeredAt: entry.registeredAt,
  };
}

function serializeTransaction(transaction) {
  return {
    id: transaction.id,
    tenantId: transaction.tenantId,
    provider: transaction.provider,
    type: transaction.type,
    externalTransactionId: transaction.externalTransactionId,
    amount: transaction.amount,
    deliveryAmount: transaction.deliveryAmount,
    fee: transaction.fee,
    counterpartyPhone: transaction.counterpartyPhone,
    counterpartyName: transaction.counterpartyName,
    destinationNumber: transaction.destinationNumber,
    balanceAfter: transaction.balanceAfter,
    occurredAt: transaction.occurredAt,
    source: transaction.source,
    status: transaction.status,
    createdAt: transaction.createdAt,
  };
}

function toPendingEntry(data) {
  return {
    transaction: new Transaction(data.transaction),
    contextKey: data.contextKey,
    registeredAt: data.registeredAt,
  };
}

function toOrphanEntry(data) {
  return {
    transaction: new Transaction(data.transaction),
    registeredAt: data.registeredAt,
  };
}

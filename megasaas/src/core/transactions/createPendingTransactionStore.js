import { InMemoryPendingTransactionStore } from './InMemoryPendingTransactionStore.js';
import { RedisPendingTransactionStore } from './RedisPendingTransactionStore.js';

export function createPendingTransactionStore({
  storeType = process.env.PENDING_TRANSACTION_STORE ?? 'memory',
  redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379',
  logger = null,
} = {}) {
  const normalizedStoreType = String(storeType).trim().toLowerCase();

  if (normalizedStoreType === 'redis') {
    logger?.info({ redisUrl }, '[createPendingTransactionStore] pending transactions persistentes via Redis');
    return new RedisPendingTransactionStore({ redisUrl });
  }

  logger?.warn('[createPendingTransactionStore] pending transactions em memoria; dados perdem-se ao reiniciar');
  return new InMemoryPendingTransactionStore();
}

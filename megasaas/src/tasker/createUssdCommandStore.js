import { BullMqUssdCommandStore } from './BullMqUssdCommandStore.js';
import { InMemoryUssdCommandStore } from './InMemoryUssdCommandStore.js';

export function createUssdCommandStore({
  storeType = process.env.USSD_COMMAND_STORE ?? 'memory',
  redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379',
  logger = null,
} = {}) {
  const normalizedStoreType = String(storeType).trim().toLowerCase();

  if (normalizedStoreType === 'bullmq' || normalizedStoreType === 'redis') {
    logger?.info({ redisUrl }, '[createUssdCommandStore] fila USSD persistente via BullMQ/Redis');
    return new BullMqUssdCommandStore({ redisUrl });
  }

  logger?.warn('[createUssdCommandStore] fila USSD em memoria; comandos pendentes perdem-se ao reiniciar');
  return new InMemoryUssdCommandStore();
}

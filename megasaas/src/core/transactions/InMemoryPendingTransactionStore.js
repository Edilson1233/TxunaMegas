import { PendingTransactionStore } from './PendingTransactionStore.js';

/**
 * InMemoryPendingTransactionStore
 * ----------------------------------
 * RISCO CONHECIDO (documentado): tanto o registo de "transactionIds já
 * usados" (idempotência) como as transações órfãs vivem só em memória —
 * reiniciar o processo apaga-os. Aceitável nesta fase; Fase 7 resolve com
 * Redis (persistente, sobrevive a reinícios, partilhado entre instâncias).
 */
export class InMemoryPendingTransactionStore extends PendingTransactionStore {
  #pending = new Map();
  #used = new Set();
  #orphanReal = new Map();

  async get(externalTransactionId) {
    return this.#pending.get(externalTransactionId) ?? null;
  }

  async set(externalTransactionId, entry) {
    this.#pending.set(externalTransactionId, entry);
    return entry;
  }

  async delete(externalTransactionId) {
    this.#pending.delete(externalTransactionId);
  }

  async listPending() {
    return Array.from(this.#pending.values());
  }

  async isUsed(externalTransactionId) {
    return this.#used.has(externalTransactionId);
  }

  async markUsed(externalTransactionId) {
    this.#used.add(externalTransactionId);
  }

  async getOrphanReal(externalTransactionId) {
    return this.#orphanReal.get(externalTransactionId) ?? null;
  }

  async setOrphanReal(externalTransactionId, entry) {
    this.#orphanReal.set(externalTransactionId, entry);
    return entry;
  }

  async deleteOrphanReal(externalTransactionId) {
    this.#orphanReal.delete(externalTransactionId);
  }

  async listOrphanReal() {
    return Array.from(this.#orphanReal.entries()).map(([externalTransactionId, entry]) => ({
      externalTransactionId,
      ...entry,
    }));
  }
}

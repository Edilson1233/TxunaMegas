/**
 * PendingTransactionStore (interface/contrato)
 * -----------------------------------------------
 * Mesmo padrão de SessionStore/WhatsAppProvider. Guarda alegações pendentes
 * (por transactionId), transações REAIS órfãs (SMS confirmada pelo Tasker
 * que chegou antes de qualquer alegação no WhatsApp — cruzamento
 * bidirecional, ver PendingTransactionManager), e um registo de
 * transactionIds já usados (para idempotência). Hoje:
 * InMemoryPendingTransactionStore. Fase 7: Redis — necessário para
 * idempotência sobreviver a reinícios do processo e valer entre múltiplas
 * instâncias.
 */
export class PendingTransactionStore {
  /** @returns {Promise<{transaction: object, contextKey: string, registeredAt: number}|null>} */
  async get(externalTransactionId) {
    throw new Error('get() não implementado');
  }

  async set(externalTransactionId, entry) {
    throw new Error('set() não implementado');
  }

  async delete(externalTransactionId) {
    throw new Error('delete() não implementado');
  }

  /** @returns {Promise<Array<{transaction: object, contextKey: string, registeredAt: number}>>} */
  async listPending() {
    throw new Error('listPending() não implementado');
  }

  /** @returns {Promise<boolean>} */
  async isUsed(externalTransactionId) {
    throw new Error('isUsed() não implementado');
  }

  async markUsed(externalTransactionId) {
    throw new Error('markUsed() não implementado');
  }

  // --- Transações reais órfãs (SMS chegou antes da alegação no WhatsApp) ---

  /** @returns {Promise<{transaction: object, registeredAt: number}|null>} */
  async getOrphanReal(externalTransactionId) {
    throw new Error('getOrphanReal() não implementado');
  }

  async setOrphanReal(externalTransactionId, entry) {
    throw new Error('setOrphanReal() não implementado');
  }

  async deleteOrphanReal(externalTransactionId) {
    throw new Error('deleteOrphanReal() não implementado');
  }

  /** @returns {Promise<Array<{externalTransactionId: string, transaction: object, registeredAt: number}>>} */
  async listOrphanReal() {
    throw new Error('listOrphanReal() não implementado');
  }
}

/**
 * SessionStore (interface/contrato)
 * ------------------------------------
 * Mesmo padrão já usado em WhatsAppProvider (Fase 1): o SessionManager
 * depende desta PORTA, não de uma implementação concreta. Hoje (Fase 4) só
 * existe InMemorySessionStore; na Fase 7, troca-se por um RedisSessionStore
 * sem o SessionManager precisar de mudar uma linha — importante porque, a
 * partir do momento em que houver mais de um processo Node.js a correr
 * (escala horizontal), sessões em memória local deixam de fazer sentido.
 */
export class SessionStore {
  /** @returns {Promise<import('./Session.js').Session|null>} */
  async get(contextKey) {
    throw new Error('get() não implementado');
  }

  /** @returns {Promise<import('./Session.js').Session>} */
  async set(contextKey, session) {
    throw new Error('set() não implementado');
  }
}

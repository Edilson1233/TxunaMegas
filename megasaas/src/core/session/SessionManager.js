import { Session } from './Session.js';

/**
 * SessionManager
 * ---------------
 * API pública para gerir sessões de compra por `contextKey`. Usa um
 * SessionStore por baixo (InMemorySessionStore hoje, Redis na Fase 7) —
 * nada que use SessionManager precisa de saber qual.
 */
export class SessionManager {
  #store;

  constructor({ store }) {
    this.#store = store;
  }

  /** Devolve a sessão existente para este contextKey, ou cria uma nova em IDLE. */
  async getOrCreate(contextKey) {
    let session = await this.#store.get(contextKey);
    if (!session) {
      session = new Session({ contextKey });
      await this.#store.set(contextKey, session);
    }
    return session;
  }

  /**
   * Transita a sessão de um contextKey para um novo estado (cria a sessão
   * primeiro, em IDLE, se ainda não existir). Lança erro se a transição não
   * for permitida (ver Session.js).
   */
  async transition(contextKey, nextState, opts) {
    const session = await this.getOrCreate(contextKey);
    session.transitionTo(nextState, opts);
    await this.#store.set(contextKey, session);
    return session;
  }
}

import { SessionStore } from './SessionStore.js';

/**
 * InMemorySessionStore
 * -----------------------
 * Implementação concreta de SessionStore usando um Map em memória.
 *
 * RISCO CONHECIDO (documentado, não bloqueia esta fase): estado perdido se
 * o processo reiniciar, e não é partilhado entre múltiplas instâncias do
 * processo. Aceitável agora (uma única instância, como toda a Fase 1-4) —
 * resolvido na Fase 7 com um RedisSessionStore atrás da mesma interface.
 */
export class InMemorySessionStore extends SessionStore {
  #sessions = new Map();

  async get(contextKey) {
    return this.#sessions.get(contextKey) ?? null;
  }

  async set(contextKey, session) {
    this.#sessions.set(contextKey, session);
    return session;
  }
}

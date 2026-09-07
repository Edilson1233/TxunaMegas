/**
 * RateLimiter
 * ------------
 * Limitador simples de pedidos por janela de tempo, em memória. Suficiente
 * para uma única instância (Fase 5); a Fase 7 troca por um limitador
 * apoiado em Redis, partilhado entre instâncias.
 */
export class RateLimiter {
  #hits = new Map(); // key -> array de timestamps (ms)
  #maxRequests;
  #windowMs;

  constructor({ maxRequests = 30, windowMs = 60_000 } = {}) {
    this.#maxRequests = maxRequests;
    this.#windowMs = windowMs;
  }

  /** @returns {boolean} true se o pedido é permitido */
  allow(key) {
    const now = Date.now();
    const timestamps = (this.#hits.get(key) ?? []).filter((t) => now - t < this.#windowMs);
    if (timestamps.length >= this.#maxRequests) {
      this.#hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.#hits.set(key, timestamps);
    return true;
  }
}

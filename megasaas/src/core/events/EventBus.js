import { EventEmitter } from 'node:events';

/**
 * EventBus
 * ---------
 * Abstração fina sobre EventEmitter, usada como ÚNICO ponto de comunicação
 * entre a camada WhatsApp e o resto do sistema.
 *
 * DECISÃO ARQUITETURAL:
 * Nesta fase (1) o bus é local, em memória. Na Fase 7 ele será substituído
 * por uma implementação apoiada em BullMQ/Redis (filas reais, persistentes,
 * com retries). A interface pública (emit/on/off) NÃO muda — quem consome
 * o EventBus hoje não precisa de reescrever nada quando isso acontecer.
 *
 * Isto é o que chamamos de "porta e adaptador" (ports & adapters / hexagonal):
 * o resto do sistema depende da PORTA (esta classe), não do ADAPTADOR
 * (EventEmitter hoje, BullMQ amanhã).
 */
export class EventBus {
  #emitter;
  #logger;

  constructor({ logger }) {
    this.#emitter = new EventEmitter();
    // Baileys/Node podem emitir muitos listeners concorrentes (múltiplos tenants
    // no futuro); evitamos o warning de MaxListeners por defeito.
    this.#emitter.setMaxListeners(50);
    this.#logger = logger;
  }

  /**
   * Publica um evento.
   * @param {string} eventName - ver contrato em whatsapp/events/WhatsAppEvents.js
   * @param {object} payload - deve seguir o schema documentado para o eventName
   */
  emit(eventName, payload) {
    this.#logger.debug({ eventName }, '[EventBus] evento emitido');
    this.#emitter.emit(eventName, payload);
  }

  /**
   * Subscreve um evento.
   *
   * IMPORTANTE (correção pós-Fase 4): o handler é executado dentro de uma
   * proteção try/catch — incluindo handlers assíncronos, cuja rejeição é
   * capturada explicitamente. Sem isto, um erro dentro de QUALQUER handler
   * (bug de lógica, estado inesperado, etc.) torna-se uma exceção não
   * apanhada que derruba o processo Node.js inteiro — para todos os
   * clientes, não só para quem mandou a mensagem que despoletou o erro.
   * Isto já aconteceu uma vez em testes reais (ver ROADMAP.md, Fase 4).
   *
   * @param {string} eventName
   * @param {(payload: object) => void} handler
   * @returns {() => void} função para cancelar a subscrição
   */
  on(eventName, handler) {
    const safeHandler = (payload) => {
      try {
        const result = handler(payload);
        if (result && typeof result.catch === 'function') {
          result.catch((err) => {
            this.#logger.error({ err, eventName }, '[EventBus] handler assíncrono falhou — processo continua');
          });
        }
      } catch (err) {
        this.#logger.error({ err, eventName }, '[EventBus] handler síncrono falhou — processo continua');
      }
    };

    this.#emitter.on(eventName, safeHandler);
    return () => this.#emitter.off(eventName, safeHandler);
  }

  /**
   * Subscreve um evento apenas uma vez.
   */
  once(eventName, handler) {
    this.#emitter.once(eventName, handler);
  }
}

/**
 * UssdCommandStore
 * ----------------
 * Contrato de persistencia da fila USSD.
 *
 * Hoje existe uma implementacao em memoria. A Fase 7 substitui isto por
 * armazenamento persistente/partilhado, mantendo a API de UssdCommandQueue.
 */
export class UssdCommandStore {
  save(_command) {
    throw new Error('[UssdCommandStore] save() nao implementado');
  }

  get(_commandId) {
    throw new Error('[UssdCommandStore] get() nao implementado');
  }

  delete(_commandId) {
    throw new Error('[UssdCommandStore] delete() nao implementado');
  }

  list() {
    throw new Error('[UssdCommandStore] list() nao implementado');
  }
}

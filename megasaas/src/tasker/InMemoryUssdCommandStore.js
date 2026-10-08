import { UssdCommandStore } from './UssdCommandStore.js';

/**
 * InMemoryUssdCommandStore
 * ------------------------
 * Implementacao local da fila USSD. Mantem ordem de insercao, mas nao
 * sobrevive a reinicio do processo.
 */
export class InMemoryUssdCommandStore extends UssdCommandStore {
  #commands = new Map();

  save(command) {
    this.#commands.set(command.id, command);
    return command;
  }

  get(commandId) {
    return this.#commands.get(commandId) ?? null;
  }

  delete(commandId) {
    return this.#commands.delete(commandId);
  }

  list() {
    return [...this.#commands.values()];
  }
}

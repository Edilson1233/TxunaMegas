import { UssdCommandStore } from './UssdCommandStore.js';

/**
 * InMemoryUssdCommandStore
 * ------------------------
 * Implementacao local da fila USSD. Mantem ordem de insercao, mas nao
 * sobrevive a reinicio do processo.
 */
export class InMemoryUssdCommandStore extends UssdCommandStore {
  #commands = new Map();

  async save(command) {
    this.#commands.set(command.id, command);
    return command;
  }

  async get(commandId) {
    return this.#commands.get(commandId) ?? null;
  }

  async delete(commandId) {
    return this.#commands.delete(commandId);
  }

  async list() {
    return [...this.#commands.values()];
  }
}

import { randomUUID } from 'node:crypto';
import { UssdCommand, UssdCommandStatus } from './UssdCommand.js';
import { UssdEvents } from './UssdEvents.js';

/**
 * UssdCommandQueue
 * ------------------
 * Fila de comandos USSD pendentes de execução pelo Tasker.
 *
 * RISCO CONHECIDO (documentado, igual ao padrão das fases anteriores):
 * implementação em memória (Map, ordem de inserção) — perde-se com reinício
 * do processo. A Fase 7 substitui por BullMQ (fila persistente, com
 * retries automáticos se o Tasker não confirmar a tempo).
 */
export class UssdCommandQueue {
  #commands = new Map();
  #eventBus;
  #logger;

  constructor({ eventBus, logger }) {
    this.#eventBus = eventBus;
    this.#logger = logger;
  }

  enqueue({ transactionId, contextKey, destinationNumber, amount = null, paymentAmount = null, deliveryAmount = null }) {
    const command = new UssdCommand({
      id: randomUUID(),
      transactionId,
      contextKey,
      destinationNumber,
      amount,
      paymentAmount,
      deliveryAmount,
    });
    this.#commands.set(command.id, command);
    this.#logger?.info(
      { commandId: command.id, transactionId, destinationNumber },
      '[UssdCommandQueue] comando USSD colocado na fila'
    );
    return command;
  }

  /** Chamado pelo endpoint que o Tasker usa para pedir o próximo trabalho. */
  dequeueNext() {
    for (const command of this.#commands.values()) {
      if (command.status === UssdCommandStatus.PENDING) {
        command.status = UssdCommandStatus.DISPATCHED;
        command.dispatchedAt = new Date().toISOString();
        this.#eventBus?.emit(UssdEvents.DISPATCHED, { command });
        return command;
      }
    }
    return null;
  }

  /** Chamado pelo endpoint de confirmação (sucesso ou falha da execução). */
  ack(commandId, { success, details = null }) {
    const command = this.#commands.get(commandId);
    if (!command) return null;

    command.status = success ? UssdCommandStatus.COMPLETED : UssdCommandStatus.FAILED;
    this.#commands.delete(commandId);

    const eventName = success ? UssdEvents.COMPLETED : UssdEvents.FAILED;
    this.#eventBus?.emit(eventName, { command, details });
    return command;
  }

  ackMatchingTransfer({ transaction, details = 'SMS Transferiste confirmou execucao USSD' }) {
    for (const command of this.#commands.values()) {
      if (command.status !== UssdCommandStatus.DISPATCHED) continue;
      if (Number(command.paymentAmount) !== Number(transaction.amount) && Number(command.deliveryAmount) !== Number(transaction.amount)) continue;
      if (!samePhone(command.destinationNumber, transaction.counterpartyPhone)) continue;

      return this.ack(command.id, { success: true, details });
    }

    return null;
  }
}

function samePhone(left, right) {
  const normalizedLeft = normalizeMzPhone(left);
  const normalizedRight = normalizeMzPhone(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizeMzPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('258')) return digits.slice(3);
  return digits;
}

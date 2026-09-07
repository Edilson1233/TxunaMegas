/**
 * UssdCommand
 * ------------
 * Representa uma ordem para o Tasker executar o USSD de transferência de
 * megas (ex: *111#), depois de uma alegação de pagamento ter sido
 * verificada com sucesso (Fase 4 + Fase 5).
 */
export const UssdCommandStatus = Object.freeze({
  PENDING: 'PENDING',
  DISPATCHED: 'DISPATCHED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

export class UssdCommand {
  constructor({
    id,
    transactionId,
    contextKey,
    destinationNumber = null,
    amount = null,
    paymentAmount = null,
    deliveryAmount = null,
    status = UssdCommandStatus.PENDING,
    createdAt = new Date().toISOString(),
    dispatchedAt = null,
  }) {
    if (!id) throw new TypeError('[UssdCommand] id é obrigatório');
    if (!transactionId) throw new TypeError('[UssdCommand] transactionId é obrigatório');
    if (!contextKey) throw new TypeError('[UssdCommand] contextKey é obrigatório');

    this.id = id;
    this.transactionId = transactionId;
    this.contextKey = contextKey;
    this.destinationNumber = destinationNumber;
    this.paymentAmount = paymentAmount ?? amount;
    this.deliveryAmount = deliveryAmount ?? amount;
    this.amount = this.deliveryAmount;
    this.status = status;
    this.createdAt = createdAt;
    this.dispatchedAt = dispatchedAt;
  }
}

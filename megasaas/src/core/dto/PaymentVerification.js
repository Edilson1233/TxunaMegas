/**
 * Motivo pelo qual uma verificação de pagamento falhou.
 */
export const PaymentVerificationReason = Object.freeze({
  /** Nenhuma SMS real (Tasker) corresponde ao que o cliente alegou. */
  NOT_FOUND: 'NOT_FOUND',
  /** Encontrada transação com o mesmo transactionId, mas valor não bate certo. */
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  /** transactionId já foi usado antes — proteção de idempotência/anti-replay. */
  ALREADY_USED: 'ALREADY_USED',
  INVALID_SOURCE: 'INVALID_SOURCE',
  INVALID_TRANSACTION_TYPE: 'INVALID_TRANSACTION_TYPE',
  TENANT_DISABLED: 'TENANT_DISABLED',
  DEVICE_NOT_AUTHORIZED: 'DEVICE_NOT_AUTHORIZED',
});

/**
 * PaymentVerification
 * ---------------------
 * Representa o RESULTADO de cruzar uma alegação de pagamento (texto do
 * WhatsApp) com a fonte de verdade real (SMS lida pelo Tasker). É este DTO
 * que a Fase 4/5 vão usar para decidir que resposta dar ao cliente no
 * WhatsApp — corresponde exatamente ao nó de decisão "Cruza com SMS real"
 * do fluxo acordado (ver ROADMAP/PROJECT_CONTEXT): `verified === true` leva
 * à resposta "a processar" → "megas transferidos"; `verified === false`
 * leva à resposta "pedido não encontrado".
 */
export class PaymentVerification {
  constructor({
    verified,
    transaction = null,
    reason = null,
    claimedTransactionId = null,
    checkedAt = new Date().toISOString(),
  }) {
    if (typeof verified !== 'boolean') {
      throw new TypeError('[PaymentVerification] verified deve ser boolean');
    }
    if (verified && !transaction) {
      throw new TypeError('[PaymentVerification] uma verificação positiva precisa de uma Transaction associada');
    }
    if (!verified && !reason) {
      throw new TypeError('[PaymentVerification] uma verificação negativa precisa de um reason');
    }

    this.verified = verified;
    this.transaction = transaction;
    this.reason = reason;
    this.claimedTransactionId = claimedTransactionId;
    this.checkedAt = checkedAt;
  }

  /** @param {import('./Transaction.js').Transaction} transaction */
  static verified(transaction, { claimedTransactionId = null } = {}) {
    return new PaymentVerification({ verified: true, transaction, claimedTransactionId });
  }

  /** @param {string} reason - ver PaymentVerificationReason */
  static rejected(reason, { claimedTransactionId = null } = {}) {
    return new PaymentVerification({ verified: false, reason, claimedTransactionId });
  }
}

/**
 * TransactionType
 * -----------------
 * Enum canónico do "tipo" de uma transação de pagamento — vive no core
 * porque é usado tanto pelo parser M-Pesa (Fase 2) como pelos DTOs de
 * negócio (Fase 3) e, mais tarde, pelo parser e-Mola. Nenhum módulo
 * específico de operadora deve "dono" deste enum.
 */
export const TransactionType = Object.freeze({
  /** Dinheiro RECEBIDO de alguém (ex: cliente final a pagar megas). */
  RECEIVED: 'RECEIVED',
  /** Dinheiro TRANSFERIDO para outro número (ex: revendedor a repassar saldo). */
  TRANSFER_SENT: 'TRANSFER_SENT',
  /** Texto não corresponde a nenhum tipo de transação conhecido. */
  UNKNOWN: 'UNKNOWN',
});

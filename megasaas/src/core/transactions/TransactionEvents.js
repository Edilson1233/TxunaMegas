/**
 * TransactionEvents
 * -------------------
 * Catálogo de eventos publicados pelo PendingTransactionManager no
 * EventBus (mesmo padrão de WhatsAppEvents, Fase 1). Todos os payloads
 * incluem `contextKey`, para que quem escuta saiba a que conversa
 * responder — sem isso, seria impossível ligar de volta uma verificação ao
 * cliente certo no WhatsApp.
 */
export const TransactionEvents = Object.freeze({
  /**
   * Emitido quando uma alegação de pagamento (texto do WhatsApp) é
   * registada como pendente, à espera de confirmação real.
   * Payload: { transaction: Transaction, contextKey: string }
   */
  CLAIM_REGISTERED: 'transaction.claim.registered',

  /**
   * Emitido quando uma alegação pendente é cruzada com uma transação real
   * (Tasker, Fase 5) — quer o resultado seja positivo quer negativo.
   * Payload: { verification: PaymentVerification, contextKey: string }
   */
  CLAIM_VERIFIED: 'transaction.claim.verified',

  /**
   * Emitido quando uma alegação pendente expira sem confirmação (timeout).
   * Payload: { verification: PaymentVerification, contextKey: string }
   */
  CLAIM_EXPIRED: 'transaction.claim.expired',
});

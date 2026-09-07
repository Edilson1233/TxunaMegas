/**
 * SessionState
 * -------------
 * Estados possíveis de uma sessão de compra, por `contextKey`.
 *
 *   IDLE                       → nada em curso
 *   AWAITING_DESTINATION_NUMBER → cliente alegou pagamento mas não indicou
 *                                 o número que deve receber os megas — bot
 *                                 pediu-o e aguarda resposta
 *   AWAITING_VERIFICATION      → alegação completa, a aguardar cruzamento
 *                                com SMS real (Fase 5)
 *   PROCESSING                  → alegação confirmada, USSD a decorrer (Fase 5)
 *   COMPLETED                    → megas entregues
 *   NOT_FOUND                    → alegação rejeitada (não encontrada, valor
 *                                não bate certo, ou já usada antes)
 */
export const SessionState = Object.freeze({
  IDLE: 'IDLE',
  AWAITING_DESTINATION_NUMBER: 'AWAITING_DESTINATION_NUMBER',
  AWAITING_VERIFICATION: 'AWAITING_VERIFICATION',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  NOT_FOUND: 'NOT_FOUND',
});

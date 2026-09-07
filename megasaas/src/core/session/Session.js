import { SessionState } from './SessionState.js';

// Tabela explícita de transições válidas. Uma sessão NUNCA salta, por
// exemplo, de IDLE diretamente para COMPLETED — isto protege contra bugs
// de lógica nas fases seguintes (ex: um evento processado fora de ordem).
//
// Nota (correção pós-Fase 4): a versão inicial só permitia UMA alegação de
// cada vez, e lançava erro se chegasse uma nova mensagem M-Pesa enquanto a
// anterior ainda estava pendente — um cenário perfeitamente normal (cliente
// manda duas transferências seguidas). Por isso AWAITING_VERIFICATION e
// NOT_FOUND permitem "auto-loop", e COMPLETED permite ir direto para
// AWAITING_VERIFICATION (nova compra logo a seguir a uma concluída).
// PROCESSING -> AWAITING_VERIFICATION continua por decidir explicitamente
// na Fase 5 (o que fazer se chegar uma alegação nova a meio da execução do
// USSD é uma decisão de negócio, não só técnica).
// Nota (pós-Fase 5): AWAITING_DESTINATION_NUMBER entra quando o cliente não
// indica o número de destino no texto — o bot pede-o e a sessão fica à
// espera dessa resposta antes de avançar para AWAITING_VERIFICATION.
const ALLOWED_TRANSITIONS = Object.freeze({
  [SessionState.IDLE]: [SessionState.AWAITING_VERIFICATION, SessionState.AWAITING_DESTINATION_NUMBER],
  [SessionState.AWAITING_DESTINATION_NUMBER]: [
    SessionState.AWAITING_DESTINATION_NUMBER,
    SessionState.AWAITING_VERIFICATION,
  ],
  [SessionState.AWAITING_VERIFICATION]: [
    SessionState.AWAITING_VERIFICATION,
    SessionState.PROCESSING,
    SessionState.NOT_FOUND,
  ],
  [SessionState.PROCESSING]: [SessionState.COMPLETED, SessionState.NOT_FOUND],
  [SessionState.COMPLETED]: [
    SessionState.IDLE,
    SessionState.AWAITING_VERIFICATION,
    SessionState.AWAITING_DESTINATION_NUMBER,
  ],
  [SessionState.NOT_FOUND]: [
    SessionState.IDLE,
    SessionState.AWAITING_VERIFICATION,
    SessionState.AWAITING_DESTINATION_NUMBER,
    SessionState.NOT_FOUND,
  ],
});

/**
 * Session
 * --------
 * Estado da conversa de compra para um `contextKey` (ver ContextKeyResolver,
 * Fase 1). Guarda também o `currentTransactionId` da alegação em curso, para
 * que, quando uma verificação real chegar (Fase 5), seja possível saber a
 * que conversa ela pertence.
 */
export class Session {
  constructor({
    contextKey,
    state = SessionState.IDLE,
    currentTransactionId = null,
    updatedAt = new Date().toISOString(),
  }) {
    if (!contextKey) {
      throw new TypeError('[Session] contextKey é obrigatório');
    }

    this.contextKey = contextKey;
    this.state = state;
    this.currentTransactionId = currentTransactionId;
    this.updatedAt = updatedAt;
  }

  /**
   * Transita a sessão para um novo estado. Lança erro se a transição não
   * for permitida — isto é o que torna impossível, por construção, um bug
   * futuro fazer uma sessão "saltar" estados de forma inconsistente.
   */
  transitionTo(nextState, { currentTransactionId } = {}) {
    const allowed = ALLOWED_TRANSITIONS[this.state] ?? [];
    if (!allowed.includes(nextState)) {
      throw new Error(`[Session] transição inválida: ${this.state} -> ${nextState} (contextKey=${this.contextKey})`);
    }

    this.state = nextState;
    if (currentTransactionId !== undefined) {
      this.currentTransactionId = currentTransactionId;
    }
    this.updatedAt = new Date().toISOString();
    return this;
  }
}

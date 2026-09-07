/**
 * ContextKeyResolver
 * -------------------
 * Gera a "context key" obrigatória do sistema, usada para identificar de
 * forma única uma sessão de conversa/compra:
 *
 *   PRIVATE -> chatId
 *   GROUP   -> groupId::userId
 *
 * Porquê isto importa: num grupo de WhatsApp, várias pessoas podem estar a
 * negociar a compra de megas ao mesmo tempo. Se usássemos apenas o groupId
 * como chave, todas as sessões se misturariam. Ao combinar groupId + userId,
 * cada participante do grupo tem o seu próprio "carrinho"/sessão isolada,
 * mesmo dentro da mesma conversa de grupo.
 *
 * Esta classe é usada por TODAS as fases seguintes (SessionManager,
 * PendingTransactionManager, etc.) — o contrato de saída é estável desde já.
 */
export class ContextKeyResolver {
  /**
   * @param {object} params
   * @param {'PRIVATE'|'GROUP'} params.chatType
   * @param {string} params.chatId - id do chat (privado) ou do grupo
   * @param {string} [params.userId] - obrigatório quando chatType === 'GROUP'
   * @returns {string} context key
   */
  static resolve({ chatType, chatId, userId }) {
    if (!chatId) {
      throw new Error('[ContextKeyResolver] chatId é obrigatório');
    }

    if (chatType === 'PRIVATE') {
      return chatId;
    }

    if (chatType === 'GROUP') {
      if (!userId) {
        throw new Error('[ContextKeyResolver] userId é obrigatório para contexto GROUP');
      }
      return `${chatId}::${userId}`;
    }

    throw new Error(`[ContextKeyResolver] chatType desconhecido: ${chatType}`);
  }

  /**
   * Operação inversa — útil para logging/debug e para a Fase 4 (SessionManager).
   * @param {string} contextKey
   * @returns {{ chatType: 'PRIVATE'|'GROUP', chatId: string, userId?: string }}
   */
  static parse(contextKey) {
    if (contextKey.includes('::')) {
      const [chatId, userId] = contextKey.split('::');
      return { chatType: 'GROUP', chatId, userId };
    }
    return { chatType: 'PRIVATE', chatId: contextKey };
  }
}

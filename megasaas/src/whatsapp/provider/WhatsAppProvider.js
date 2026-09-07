/**
 * WhatsAppProvider (interface/contrato)
 * ---------------------------------------
 * Qualquer biblioteca de WhatsApp (Baileys hoje, outra amanhã) deve ser
 * "encapsulada" atrás desta interface. Nenhum código fora de src/whatsapp/provider
 * deve importar Baileys diretamente — isto é o que nos permite trocar de
 * biblioteca no futuro (ex: se a Meta bloquear Baileys) sem reescrever o
 * resto do sistema (parsers, session manager, etc.).
 *
 * Em JS não há "interface" nativa, então implementamos como classe abstrata:
 * qualquer Provider concreto DEVE implementar estes métodos.
 */
export class WhatsAppProvider {
  /** Inicia a ligação com o WhatsApp (gera QR se necessário). */
  async connect() {
    throw new Error('connect() não implementado');
  }

  /** Encerra a ligação de forma limpa. */
  async disconnect() {
    throw new Error('disconnect() não implementado');
  }

  /**
   * Envia uma mensagem de texto.
   * @param {string} chatId
   * @param {string} text
   * @param {object} [options]
   * @param {object} [options.quoted] - mensagem original (formato nativo do
   *   provider) a citar/responder — ver payload.raw em WhatsAppEvents.
   */
  async sendText(chatId, text, options) {
    throw new Error('sendText() não implementado');
  }

  /** @returns {'DISCONNECTED'|'CONNECTING'|'CONNECTED'} */
  getStatus() {
    throw new Error('getStatus() não implementado');
  }
}

/**
 * WhatsAppEvents
 * ---------------
 * Catálogo centralizado dos eventos que a camada WhatsApp publica no EventBus.
 * Nenhum outro módulo deve "inventar" um nome de evento em string solta —
 * todos importam daqui. Isto evita bugs de digitação e serve como documentação
 * viva do contrato entre módulos (e, mais tarde, entre Node.js e Spring Boot
 * via BullMQ, Fase 7).
 */
export const WhatsAppEvents = Object.freeze({
  /**
   * Emitido para cada mensagem recebida (privada ou de grupo).
   * Payload:
   * {
   *   contextKey: string,          // ver ContextKeyResolver
   *   chatType: 'PRIVATE'|'GROUP',
   *   chatId: string,
   *   userId: string,              // remetente
   *   instanceId: string,          // qual instância/número recebeu
   *   messageId: string,
   *   text: string | null,
   *   timestamp: string,           // ISO-8601
   *   raw: object                  // mensagem original do Baileys (para debug/parsers futuros)
   * }
   */
  MESSAGE_RECEIVED: 'whatsapp.message.received',

  /**
   * Emitido quando o estado da ligação muda (connecting, open, close).
   * Payload: { instanceId: string, status: string, reason?: string }
   */
  CONNECTION_UPDATE: 'whatsapp.connection.update',

  /**
   * Emitido quando é preciso escanear um novo QR code.
   * Payload: { instanceId: string, qr: string }
   */
  QR_GENERATED: 'whatsapp.qr.generated',
});

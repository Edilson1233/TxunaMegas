/**
 * UssdEvents
 * -----------
 * Catálogo de eventos publicados pelo UssdCommandQueue no EventBus (mesmo
 * padrão de WhatsAppEvents/TransactionEvents das fases anteriores).
 */
export const UssdEvents = Object.freeze({
  /** Payload: { command: UssdCommand } */
  DISPATCHED: 'ussd.command.dispatched',
  /** Payload: { command: UssdCommand, details: string|null } */
  COMPLETED: 'ussd.command.completed',
  /** Payload: { command: UssdCommand, details: string|null } */
  FAILED: 'ussd.command.failed',
});

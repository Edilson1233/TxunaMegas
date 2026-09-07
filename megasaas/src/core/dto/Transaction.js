import { PaymentProvider } from './PaymentProvider.js';
import { TransactionType } from './TransactionType.js';

/**
 * De onde vieram os dados desta Transaction. É o campo mais importante
 * deste ficheiro: torna a regra de ouro da arquitetura — "nunca confiar em
 * texto do WhatsApp para liberar megas" — impossível de esquecer por
 * acidente. Qualquer código que decida acionar o USSD (Fase 5) TEM de
 * verificar `transaction.source === TransactionSource.TASKER_SMS` antes de
 * agir; se isso não for verificado, é um bug óbvio de rever em code review,
 * não um detalhe escondido numa condição qualquer.
 */
export const TransactionSource = Object.freeze({
  /** Texto colado/escrito pelo cliente no WhatsApp — NUNCA confiável sozinho. */
  WHATSAPP_TEXT: 'WHATSAPP_TEXT',
  /** SMS real lida pelo Tasker no telemóvel do revendedor — única fonte de verdade. */
  TASKER_SMS: 'TASKER_SMS',
});

export const TransactionStatus = Object.freeze({
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  DUPLICATE: 'DUPLICATE',
});

/**
 * Transaction
 * ------------
 * Representa uma transação de pagamento CANÓNICA — o "objeto de verdade"
 * que todas as camadas do sistema (Node.js hoje, Spring Boot na Fase 6)
 * usam para falar sobre "isto foi pago, ou está a ser verificado".
 *
 * NÃO é o mesmo que ParserResult: um ParserResult é só o resultado de
 * TENTAR interpretar uma SMS (pode falhar); uma Transaction só deve
 * existir a partir de uma tentativa bem-sucedida (matched === true).
 */
export class Transaction {
  constructor({
    id = null,
    tenantId,
    provider,
    type,
    externalTransactionId = null,
    amount,
    deliveryAmount = null,
    fee = null,
    counterpartyPhone = null,
    counterpartyName = null,
    destinationNumber = null,
    balanceAfter = null,
    occurredAt = null,
    source,
    status = TransactionStatus.PENDING,
    createdAt = new Date().toISOString(),
  }) {
    if (!tenantId) {
      throw new TypeError('[Transaction] tenantId é obrigatório');
    }
    if (!Object.values(PaymentProvider).includes(provider)) {
      throw new TypeError(`[Transaction] provider inválido: ${provider}`);
    }
    if (!Object.values(TransactionType).includes(type) || type === TransactionType.UNKNOWN) {
      throw new TypeError(`[Transaction] type inválido para uma transação confirmada: ${type}`);
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new TypeError('[Transaction] amount deve ser number');
    }
    if (!Object.values(TransactionSource).includes(source)) {
      throw new TypeError(`[Transaction] source inválido: ${source}`);
    }
    if (!Object.values(TransactionStatus).includes(status)) {
      throw new TypeError(`[Transaction] status inválido: ${status}`);
    }

    this.id = id;
    this.tenantId = tenantId;
    this.provider = provider;
    this.type = type;
    this.externalTransactionId = externalTransactionId;
    this.amount = amount;
    this.deliveryAmount = deliveryAmount;
    this.fee = fee;
    this.counterpartyPhone = counterpartyPhone;
    this.counterpartyName = counterpartyName;
    this.destinationNumber = destinationNumber;
    this.balanceAfter = balanceAfter;
    this.occurredAt = occurredAt;
    this.source = source;
    this.status = status;
    this.createdAt = createdAt;
  }

  /**
   * Constrói uma Transaction a partir de um ParserResult já reconhecido.
   * Lança erro se o ParserResult não tiver sido reconhecido (matched=false)
   * — não faz sentido existir uma transação "confirmada" sem dados por trás.
   *
   * @param {import('./ParserResult.js').ParserResult} parserResult
   * @param {object} params
   * @param {import('./TenantContext.js').TenantContext} params.tenantContext
   * @param {string} params.source - ver TransactionSource
   */
  static fromParserResult(parserResult, { tenantContext, source }) {
    if (!parserResult.matched) {
      throw new Error(
        '[Transaction] não é possível criar Transaction a partir de um ParserResult não reconhecido (matched=false)'
      );
    }

    return new Transaction({
      tenantId: tenantContext.tenantId,
      provider: parserResult.provider,
      type: parserResult.type,
      externalTransactionId: parserResult.transactionId,
      amount: parserResult.amount,
      fee: parserResult.fee,
      counterpartyPhone: parserResult.counterpartyPhone,
      counterpartyName: parserResult.counterpartyName,
      destinationNumber: parserResult.destinationNumber,
      balanceAfter: parserResult.balance,
      occurredAt: parserResult.occurredAt,
      source,
    });
  }
}

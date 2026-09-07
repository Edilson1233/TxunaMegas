import { TransactionType } from './TransactionType.js';

/**
 * ParserResult
 * -------------
 * Formaliza como classe o shape que o MpesaParser já devolvia desde a
 * Fase 2. Qualquer parser de SMS de pagamento (M-Pesa hoje, e-Mola amanhã)
 * deve devolver instâncias desta classe — é o que garante que todas as
 * camadas do sistema "falam a mesma língua" sobre o resultado de tentar
 * interpretar uma SMS, independentemente da operadora.
 *
 * Não valida regras de negócio (isso é da Fase 4/5) — só garante que o
 * shape dos dados é sempre consistente, quer a SMS tenha sido reconhecida
 * quer não. É imutável (Object.freeze): um resultado de parsing já
 * calculado não deve ser alterado por quem o consome.
 */
export class ParserResult {
  constructor({
    matched,
    type,
    provider,
    transactionId = null,
    amount = null,
    fee = null,
    counterpartyPhone = null,
    counterpartyName = null,
    occurredAt = null,
    balance = null,
    destinationNumber = null,
    warnings = [],
    raw = null,
    parserVersion,
  }) {
    if (typeof matched !== 'boolean') {
      throw new TypeError('[ParserResult] matched deve ser boolean');
    }
    if (!provider) {
      throw new TypeError('[ParserResult] provider é obrigatório');
    }
    if (!parserVersion) {
      throw new TypeError('[ParserResult] parserVersion é obrigatório');
    }

    this.matched = matched;
    this.type = type;
    this.provider = provider;
    this.transactionId = transactionId;
    this.amount = amount;
    this.fee = fee;
    this.counterpartyPhone = counterpartyPhone;
    this.counterpartyName = counterpartyName;
    this.occurredAt = occurredAt;
    this.balance = balance;
    this.destinationNumber = destinationNumber;
    this.warnings = warnings;
    this.raw = raw;
    this.parserVersion = parserVersion;

    Object.freeze(this);
  }

  /** Constrói um resultado de SMS reconhecida com sucesso. */
  static matched({
    type,
    provider,
    transactionId,
    amount,
    fee,
    counterpartyPhone,
    counterpartyName,
    occurredAt,
    balance,
    destinationNumber,
    warnings,
    raw,
    parserVersion,
  }) {
    return new ParserResult({
      matched: true,
      type,
      provider,
      transactionId,
      amount,
      fee,
      counterpartyPhone,
      counterpartyName,
      occurredAt,
      balance,
      destinationNumber,
      warnings,
      raw,
      parserVersion,
    });
  }

  /** Constrói um resultado de texto não reconhecido como nenhuma SMS conhecida. */
  static unknown({ provider, warnings, raw, parserVersion }) {
    return new ParserResult({
      matched: false,
      type: TransactionType.UNKNOWN,
      provider,
      warnings,
      raw,
      parserVersion,
    });
  }
}

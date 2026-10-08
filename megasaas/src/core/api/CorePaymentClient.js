import crypto from 'node:crypto';
import { ContextKeyResolver } from '../context/ContextKeyResolver.js';

const DEFAULT_TIMEOUT_MS = 5_000;

export class CorePaymentClient {
  #baseUrl;
  #token;
  #timeoutMs;
  #logger;

  constructor({ baseUrl, token, timeoutMs = DEFAULT_TIMEOUT_MS, logger = null }) {
    if (!baseUrl) {
      throw new Error('[CorePaymentClient] baseUrl e obrigatorio');
    }
    if (!token) {
      throw new Error('[CorePaymentClient] token e obrigatorio');
    }

    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#token = token;
    this.#timeoutMs = timeoutMs;
    this.#logger = logger;
  }

  async registerPaymentClaim({
    transaction,
    parsedPayment,
    contextKey,
    whatsappInstanceId,
    chatType,
    chatId,
    userId = null,
    messageId,
    rawMessageText = null,
    receivedAt,
  }) {
    const chat = chatType && chatId ? { chatType, chatId, userId } : ContextKeyResolver.parse(contextKey);
    const effectiveMessageId = messageId ?? transaction.externalTransactionId;
    const idempotencyKey = this.#idempotencyKey('payment-claim', [
      transaction.tenantId,
      whatsappInstanceId,
      effectiveMessageId,
      contextKey,
    ]);

    return this.#post('/internal/v1/payment-claims', {
      tenantId: transaction.tenantId,
      whatsappInstanceId,
      contextKey,
      chatType: chat.chatType,
      chatId: chat.chatId,
      userId: chat.userId ?? null,
      messageId: effectiveMessageId,
      receivedAt: receivedAt ?? new Date().toISOString(),
      rawMessageText,
      parsedPayment: this.#toParsedPayment(transaction, parsedPayment),
    }, idempotencyKey);
  }

  async registerSmsConfirmation({
    transaction,
    parsedPayment,
    deviceId,
    rawSms,
    reportedAt,
  }) {
    const idempotencyKey = this.#idempotencyKey('sms-payment-confirmation', [
      transaction.tenantId,
      deviceId,
      transaction.provider,
      transaction.externalTransactionId,
    ]);

    return this.#post('/internal/v1/payment-confirmations/sms', {
      tenantId: transaction.tenantId,
      deviceId,
      provider: transaction.provider,
      externalTransactionId: transaction.externalTransactionId,
      amount: transaction.amount,
      rawSms,
      reportedAt: reportedAt ?? new Date().toISOString(),
      parsedPayment: this.#toParsedPayment(transaction, parsedPayment),
    }, idempotencyKey);
  }

  async registerUssdCommand({
    transaction,
    deviceId,
    destinationNumber,
    amount,
  }) {
    if (!transaction.orderId || !transaction.paymentId) {
      throw new Error('[CorePaymentClient] orderId/paymentId sao obrigatorios para auditar USSD no Core');
    }

    const idempotencyKey = this.#idempotencyKey('ussd-command-create', [
      transaction.tenantId,
      transaction.orderId,
      transaction.paymentId,
      transaction.externalTransactionId,
    ]);

    return this.#post('/internal/v1/ussd-commands', {
      tenantId: transaction.tenantId,
      deviceId,
      orderId: transaction.orderId,
      paymentId: transaction.paymentId,
      externalTransactionId: transaction.externalTransactionId,
      destinationNumber,
      amount,
    }, idempotencyKey);
  }

  async ackUssdCommand({
    commandId,
    success,
    details = null,
    providerReference = null,
    rawOutput = null,
    acknowledgedAt = new Date().toISOString(),
  }) {
    return this.#post(`/internal/v1/ussd-commands/${commandId}/ack`, {
      success,
      acknowledgedAt,
      providerReference,
      details,
      rawOutput,
    });
  }

  async #post(path, body, idempotencyKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const headers = {
        Authorization: `Bearer ${this.#token}`,
        'Content-Type': 'application/json',
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const response = await fetch(`${this.#baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const responseText = await response.text();
      const responseBody = responseText ? JSON.parse(responseText) : null;

      if (!response.ok) {
        const err = new Error(`[CorePaymentClient] Core respondeu HTTP ${response.status}`);
        err.httpStatus = response.status;
        err.responseBody = responseBody;
        throw err;
      }

      return responseBody;
    } catch (err) {
      this.#logger?.error({ err, path }, '[CorePaymentClient] falha na chamada ao Core');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  #toParsedPayment(transaction, parsedPayment) {
    return {
      matched: parsedPayment?.matched ?? true,
      provider: transaction.provider,
      type: transaction.type,
      externalTransactionId: transaction.externalTransactionId,
      amount: transaction.amount,
      fee: transaction.fee,
      counterpartyPhone: transaction.counterpartyPhone,
      counterpartyName: transaction.counterpartyName,
      destinationNumber: transaction.destinationNumber ?? parsedPayment?.destinationNumber ?? null,
      balanceAfter: transaction.balanceAfter,
      occurredAt: transaction.occurredAt,
      warnings: parsedPayment?.warnings ?? [],
      parserVersion: parsedPayment?.parserVersion ?? 'unknown',
      source: transaction.source,
    };
  }

  #idempotencyKey(operation, parts) {
    return crypto
      .createHash('sha256')
      .update([operation, ...parts.map((part) => part ?? '')].join('|'))
      .digest('hex');
  }
}

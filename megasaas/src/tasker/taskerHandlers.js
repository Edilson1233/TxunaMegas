import { MpesaParser } from '../mpesa/MpesaParser.js';
import { Transaction, TransactionSource } from '../core/dto/Transaction.js';
import { TransactionType } from '../core/dto/TransactionType.js';

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/**
 * Nucleo do endpoint POST /api/v1/tasker/sms.
 *
 * SMS recebida (Recebeste) confirma pagamento do cliente.
 * SMS enviada (Transferiste) confirma execucao do USSD, quando bate com um
 * comando DISPATCHED. Isto evita depender apenas de leitura fragil da tela.
 */
export async function handleSmsReport({
  body,
  tenantContext,
  pendingTransactionManager,
  ussdCommandQueue = null,
  deviceId = null,
}) {
  const { transactionId, amount, rawSms, timestamp } = body ?? {};

  if (!rawSms || !timestamp) {
    return { httpStatus: 400, body: { status: 'REJECTED', reason: 'INVALID_PAYLOAD' } };
  }

  const reportedAt = Date.parse(timestamp);
  if (Number.isNaN(reportedAt) || Math.abs(Date.now() - reportedAt) > MAX_TIMESTAMP_SKEW_MS) {
    return { httpStatus: 400, body: { status: 'REJECTED', reason: 'STALE_TIMESTAMP' } };
  }

  const parsed = MpesaParser.parse(rawSms);
  if (!parsed.matched) {
    return { httpStatus: 422, body: { status: 'REJECTED', reason: 'UNPARSEABLE_SMS' } };
  }

  const reportedTransactionId = transactionId || parsed.transactionId;
  const reportedAmount = parseReportedAmount(amount, parsed.amount);
  if (!reportedTransactionId || reportedAmount == null) {
    return { httpStatus: 400, body: { status: 'REJECTED', reason: 'INVALID_PAYLOAD' } };
  }

  if (parsed.transactionId !== reportedTransactionId || parsed.amount !== reportedAmount) {
    return { httpStatus: 422, body: { status: 'REJECTED', reason: 'PAYLOAD_MISMATCH' } };
  }

  const realTransaction = Transaction.fromParserResult(parsed, {
    tenantContext,
    source: TransactionSource.TASKER_SMS,
  });

  if (parsed.type === TransactionType.TRANSFER_SENT) {
    const command = ussdCommandQueue?.ackMatchingTransfer({ transaction: realTransaction });
    if (command) {
      return { httpStatus: 200, body: { status: 'ACCEPTED', note: 'USSD_COMMAND_CONFIRMED' } };
    }

    return { httpStatus: 202, body: { status: 'ACCEPTED', note: 'TRANSFER_SENT_SEM_COMANDO_USSD' } };
  }

  const verification = await pendingTransactionManager.resolveWithRealTransaction(realTransaction, {
    parsedPayment: parsed,
    deviceId: body.deviceId ?? deviceId,
    rawSms,
    reportedAt: timestamp,
  });

  if (!verification) {
    return { httpStatus: 202, body: { status: 'ACCEPTED', note: 'SEM_ALEGACAO_PENDENTE' } };
  }

  if (verification.verified) {
    return { httpStatus: 200, body: { status: 'ACCEPTED' } };
  }

  return { httpStatus: 409, body: { status: 'REJECTED', reason: verification.reason } };
}

export function handleNextCommand({ ussdCommandQueue }) {
  const command = ussdCommandQueue.dequeueNext();
  if (!command) {
    return { httpStatus: 204, body: null };
  }
  return {
    httpStatus: 200,
    body: {
      commandId: command.id,
      transactionId: command.transactionId,
      destinationNumber: command.destinationNumber,
      paymentAmount: command.paymentAmount,
      deliveryAmount: command.deliveryAmount,
      amount: command.deliveryAmount,
      attemptCount: command.attemptCount,
    },
  };
}

export function handleCommandAck({ commandId, body, query = {}, ussdCommandQueue }) {
  const success = parseBoolean(body?.success ?? query?.success);
  const details = body?.details ?? query?.details ?? null;
  if (typeof success !== 'boolean') {
    return { httpStatus: 400, body: { status: 'REJECTED', reason: 'INVALID_PAYLOAD' } };
  }

  const command = ussdCommandQueue.ack(commandId, { success, details });
  if (!command) {
    return { httpStatus: 404, body: { status: 'REJECTED', reason: 'COMMAND_NOT_FOUND' } };
  }

  return { httpStatus: 200, body: { status: 'ACCEPTED' } };
}

function parseReportedAmount(amount, fallback) {
  if (amount == null || amount === '') return fallback;
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
  if (typeof amount === 'string') {
    const normalized = Number(amount.replace(',', '.'));
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

import { MpesaParser } from '../mpesa/MpesaParser.js';
import { Transaction, TransactionSource } from '../core/dto/Transaction.js';
import { TransactionType } from '../core/dto/TransactionType.js';

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const TASKER_LOCAL_UTC_OFFSET = '+02:00';
const LOCAL_TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,9})?$/;

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

  const normalizedTimestamp = normalizeTaskerTimestamp(timestamp);
  const reportedAt = normalizedTimestamp ? Date.parse(normalizedTimestamp) : NaN;
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
    const command = await ussdCommandQueue?.ackMatchingTransfer({ transaction: realTransaction });
    if (command) {
      return { httpStatus: 200, body: { status: 'ACCEPTED', note: 'USSD_COMMAND_CONFIRMED' } };
    }

    return { httpStatus: 202, body: { status: 'ACCEPTED', note: 'TRANSFER_SENT_SEM_COMANDO_USSD' } };
  }

  const verification = await pendingTransactionManager.resolveWithRealTransaction(realTransaction, {
    parsedPayment: parsed,
    deviceId: body.deviceId ?? deviceId,
    rawSms,
    reportedAt: normalizedTimestamp,
  });

  if (!verification) {
    return { httpStatus: 202, body: { status: 'ACCEPTED', note: 'SEM_ALEGACAO_PENDENTE' } };
  }

  if (verification.verified) {
    return { httpStatus: 200, body: { status: 'ACCEPTED' } };
  }

  return { httpStatus: 409, body: { status: 'REJECTED', reason: verification.reason } };
}

export async function handleNextCommand({ ussdCommandQueue }) {
  const command = await ussdCommandQueue.dequeueNext();
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

export async function handleCommandAck({ commandId, body, query = {}, ussdCommandQueue }) {
  const success = parseBoolean(body?.success ?? query?.success);
  const details = body?.details ?? query?.details ?? null;
  if (typeof success !== 'boolean') {
    return { httpStatus: 400, body: { status: 'REJECTED', reason: 'INVALID_PAYLOAD' } };
  }

  const command = await ussdCommandQueue.ack(commandId, { success, details });
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

export function normalizeTaskerTimestamp(timestamp) {
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
  }

  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const millis = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof timestamp !== 'string') return null;

  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  const localMatch = LOCAL_TIMESTAMP_REGEX.exec(trimmed);
  if (localMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const [, datePart, timePart, fraction = ''] = localMatch;
    return `${datePart}T${timePart}${fraction}${TASKER_LOCAL_UTC_OFFSET}`;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

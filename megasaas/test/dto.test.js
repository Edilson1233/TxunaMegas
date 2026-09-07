import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MpesaParser } from '../src/mpesa/MpesaParser.js';
import { Transaction, TransactionSource } from '../src/core/dto/Transaction.js';
import { PaymentVerification, PaymentVerificationReason } from '../src/core/dto/PaymentVerification.js';
import { TenantContext } from '../src/core/dto/TenantContext.js';
import { PaymentProvider } from '../src/core/dto/PaymentProvider.js';

test('TenantContext.resolveForInstance permite tenantId explicito para integracao com Core', () => {
  const tenant = TenantContext.resolveForInstance('default-instance', {
    tenantId: '11111111-1111-1111-1111-111111111111',
  });

  assert.equal(tenant.tenantId, '11111111-1111-1111-1111-111111111111');
  assert.equal(tenant.whatsappInstanceId, 'default-instance');
});

test('TenantContext.resolveForInstance devolve o tenant único por defeito', () => {
  const tenant = TenantContext.resolveForInstance('default-instance');

  assert.equal(tenant.tenantId, TenantContext.DEFAULT_TENANT_ID);
  assert.equal(tenant.whatsappInstanceId, 'default-instance');
});

test('Transaction.fromParserResult constrói uma transação válida a partir de SMS real', () => {
  const sms =
    'Confirmado DFT1KNIBSBZ. Recebeste 210.00MT de 258846227063 - Paulo Marcelino Chivinge ' +
    'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100.';

  const parsed = MpesaParser.parse(sms);
  const tenant = TenantContext.resolveForInstance('default-instance');

  const transaction = Transaction.fromParserResult(parsed, {
    tenantContext: tenant,
    source: TransactionSource.TASKER_SMS,
  });

  assert.equal(transaction.tenantId, TenantContext.DEFAULT_TENANT_ID);
  assert.equal(transaction.provider, PaymentProvider.MPESA);
  assert.equal(transaction.externalTransactionId, 'DFT1KNIBSBZ');
  assert.equal(transaction.amount, 210.0);
  assert.equal(transaction.source, TransactionSource.TASKER_SMS);
  assert.equal(transaction.status, 'PENDING');
});

test('Transaction.fromParserResult rejeita ParserResult não reconhecido', () => {
  const parsed = MpesaParser.parse('na boa'); // matched: false

  const tenant = TenantContext.resolveForInstance('default-instance');

  assert.throws(
    () => Transaction.fromParserResult(parsed, { tenantContext: tenant, source: TransactionSource.WHATSAPP_TEXT }),
    /matched=false/
  );
});

test('Transaction rejeita provider/type/source inválidos (defesa de tipo)', () => {
  const tenant = TenantContext.resolveForInstance('x');
  const baseArgs = {
    tenantId: tenant.tenantId,
    provider: PaymentProvider.MPESA,
    type: 'RECEIVED',
    amount: 10,
    source: TransactionSource.TASKER_SMS,
  };

  // provider inválido
  assert.throws(() => new Transaction({ ...baseArgs, provider: 'VISA' }));
  // amount não numérico
  assert.throws(() => new Transaction({ ...baseArgs, amount: '10' }));
  // source inválido
  assert.throws(() => new Transaction({ ...baseArgs, source: 'CLIENT_GUESS' }));
});

test('PaymentVerification.verified exige uma Transaction associada', () => {
  assert.throws(() => PaymentVerification.verified(null));
});

test('PaymentVerification.rejected exige um motivo', () => {
  const verification = PaymentVerification.rejected(PaymentVerificationReason.NOT_FOUND, {
    claimedTransactionId: 'DFU4KNQ5NVQ',
  });

  assert.equal(verification.verified, false);
  assert.equal(verification.reason, PaymentVerificationReason.NOT_FOUND);
  assert.equal(verification.transaction, null);
});

test('Cadeia completa: SMS real -> ParserResult -> Transaction -> PaymentVerification confirmada', () => {
  const sms =
    'Confirmado DFU4KNQ5NVQ. Transferiste 15.00MT e a taxa foi de 0.00MT para 858666528 - ' +
    'RILSSA ELISABETH DA CUNHA aos 30/6/26 as 12:06 AM. O teu novo saldo M-Pesa e de 301.78MT. ' +
    'Continua a transferir SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100.';

  const tenant = TenantContext.resolveForInstance('default-instance');
  const parsed = MpesaParser.parse(sms);
  const transaction = Transaction.fromParserResult(parsed, {
    tenantContext: tenant,
    source: TransactionSource.TASKER_SMS,
  });
  const verification = PaymentVerification.verified(transaction, {
    claimedTransactionId: transaction.externalTransactionId,
  });

  assert.equal(verification.verified, true);
  assert.equal(verification.transaction.externalTransactionId, 'DFU4KNQ5NVQ');
  assert.equal(verification.claimedTransactionId, 'DFU4KNQ5NVQ');
});

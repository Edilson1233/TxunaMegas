import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MpesaParser } from '../src/mpesa/MpesaParser.js';
import { MpesaMessageType } from '../src/mpesa/MpesaMessageType.js';

test('Recebeste — SMS real completa (pagamento de cliente)', () => {
  const sms =
    'Confirmado DFT1KNIBSBZ. Recebeste 210.00MT de 258846227063 - Paulo Marcelino Chivinge ' +
    'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100. ' +
    'M-Pesa e facil!';

  const result = MpesaParser.parse(sms);

  assert.equal(result.matched, true);
  assert.equal(result.type, MpesaMessageType.RECEIVED);
  assert.equal(result.transactionId, 'DFT1KNIBSBZ');
  assert.equal(result.amount, 210.0);
  assert.equal(result.fee, 0);
  assert.equal(result.counterpartyPhone, '258846227063');
  assert.equal(result.counterpartyName, 'Paulo Marcelino Chivinge');
  assert.equal(result.balance, 326.78);
  assert.equal(result.destinationNumber, null);
  assert.equal(result.occurredAt, new Date('2026-06-29T14:50:00+02:00').toISOString());
  assert.deepEqual(result.warnings, []);
});

test('Transferiste — SMS real completa, com saldo presente', () => {
  const sms =
    'Confirmado DFU4KNQ5NVQ. Transferiste 15.00MT e a taxa foi de 0.00MT para 858666528 - ' +
    'RILSSA ELISABETH DA CUNHA aos 30/6/26 as 12:06 AM. O teu novo saldo M-Pesa e de 301.78MT. ' +
    'Continua a transferir SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100.';

  const result = MpesaParser.parse(sms);

  assert.equal(result.matched, true);
  assert.equal(result.type, MpesaMessageType.TRANSFER_SENT);
  assert.equal(result.transactionId, 'DFU4KNQ5NVQ');
  assert.equal(result.amount, 15.0);
  assert.equal(result.fee, 0.0);
  assert.equal(result.counterpartyPhone, '858666528');
  assert.equal(result.counterpartyName, 'RILSSA ELISABETH DA CUNHA');
  assert.equal(result.balance, 301.78);
  assert.equal(result.destinationNumber, null);
  assert.deepEqual(result.warnings, []);
});

test('Transferiste — saldo ausente na SMS + número de destino anexado (caso real reportado)', () => {
  const sms =
    'Confirmado DFU4KNQ5NVQ. Transferiste 15.00MT e a taxa foi de 0.00MT para 858666528 - ' +
    'NOME DA PESSOA aos 30/6/26 as 12:06 AM. O teu novo saldo M-Pesa e de . Continua a ' +
    'transferir SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100. 859253929';

  const result = MpesaParser.parse(sms);

  assert.equal(result.matched, true);
  assert.equal(result.type, MpesaMessageType.TRANSFER_SENT);
  assert.equal(result.counterpartyPhone, '858666528');
  // saldo não veio na mensagem — deve ficar null, não deve lançar erro
  assert.equal(result.balance, null);
  assert.ok(result.warnings.includes('saldo_ausente_na_sms'));
  // o número extra no fim é o destino dos megas, distinto do número que pagou
  assert.equal(result.destinationNumber, '859253929');
});

test('Texto sem relação com M-Pesa não é reconhecido, mas não lança erro', () => {
  const result = MpesaParser.parse('na boa');

  assert.equal(result.matched, false);
  assert.equal(result.type, MpesaMessageType.UNKNOWN);
  assert.equal(result.transactionId, null);
  assert.ok(result.warnings.length > 0);
});

test('Texto vazio ou nulo não lança erro', () => {
  assert.equal(MpesaParser.parse('').matched, false);
  assert.equal(MpesaParser.parse(null).matched, false);
  assert.equal(MpesaParser.parse(undefined).matched, false);
});

test('Tolerante a espaços duplicados e quebras de linha (texto colado manualmente)', () => {
  const sms =
    'Confirmado   DFT1KNIBSBZ.\nRecebeste  210.00MT   de 258846227063 -   Paulo Marcelino Chivinge ' +
    'aos 29/6/26  as 2:50 PM. O teu novo saldo M-Pesa e de 326.78MT. Em caso de duvida, liga 100.';

  const result = MpesaParser.parse(sms);

  assert.equal(result.matched, true);
  assert.equal(result.transactionId, 'DFT1KNIBSBZ');
  assert.equal(result.amount, 210.0);
});

test('Valor decimal com vírgula é aceite (tolerância a erro humano)', () => {
  const sms =
    'Confirmado DFT1KNIBSBZ. Recebeste 210,50MT de 258846227063 - Paulo Marcelino Chivinge ' +
    'aos 29/6/26 as 2:50 PM. O teu novo saldo M-Pesa e de 326,78MT. Em caso de duvida, liga 100.';

  const result = MpesaParser.parse(sms);

  assert.equal(result.amount, 210.5);
  assert.equal(result.balance, 326.78);
});

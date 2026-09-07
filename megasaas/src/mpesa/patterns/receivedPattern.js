import { MpesaMessageType } from '../MpesaMessageType.js';
import { parseAmount } from '../parseAmount.js';
import { parseMpesaDateTime } from '../parseMpesaDateTime.js';

/**
 * Padrão "Recebeste" — é o tipo de SMS mais crítico do sistema: é ESTE
 * padrão que confirma que um cliente pagou ao revendedor.
 *
 * Exemplo real:
 * "Confirmado DFT1KNIBSBZ. Recebeste 210.00MT de 258846227063 -
 *  Paulo Marcelino Chivinge aos 29/6/26 as 2:50 PM. O teu novo saldo
 *  M-Pesa e de 326.78MT. Em caso de duvida, liga 100. M-Pesa e facil!"
 *
 * Nota: este padrão nunca tem "taxa" (M-Pesa não cobra para receber
 * dinheiro) — por isso `fee` é sempre fixado em 0, não extraído do texto.
 */
const RECEIVED_REGEX =
  /Recebeste\s+([\d]+(?:[.,]\d{1,2})?)\s*MT\s+de\s+(\d{6,15})\s*-\s*(.+?)\s+aos\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+as\s+(\d{1,2}:\d{2}\s*[AP]M)/i;

export const receivedPattern = {
  type: MpesaMessageType.RECEIVED,

  test(normalizedText) {
    return RECEIVED_REGEX.test(normalizedText);
  },

  extract(normalizedText) {
    const match = normalizedText.match(RECEIVED_REGEX);
    if (!match) return null;

    const [, amountRaw, phone, name, dateStr, timeStr] = match;

    return {
      amount: parseAmount(amountRaw),
      fee: 0,
      counterpartyPhone: phone,
      counterpartyName: name.trim(),
      occurredAt: parseMpesaDateTime(dateStr, timeStr),
    };
  },
};

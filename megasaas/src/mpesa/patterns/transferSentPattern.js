import { MpesaMessageType } from '../MpesaMessageType.js';
import { parseAmount } from '../parseAmount.js';
import { parseMpesaDateTime } from '../parseMpesaDateTime.js';

/**
 * Padrão "Transferiste" — dinheiro enviado PELO dono do número (ex: o
 * revendedor a repassar saldo a outro número M-Pesa). Ao contrário de
 * "Recebeste", este SMS inclui sempre uma taxa (mesmo que seja 0.00MT).
 *
 * Exemplo real:
 * "Confirmado DFU4KNQ5NVQ. Transferiste 15.00MT e a taxa foi de 0.00MT
 *  para 858666528 - RILSSA ELISABETH DA CUNHA aos 30/6/26 as 12:06 AM.
 *  O teu novo saldo M-Pesa e de 301.78MT. Continua a transferir SEM TAXAS
 *  de M-Pesa para M-Pesa. Em caso de duvida, liga 100."
 */
const TRANSFER_SENT_REGEX =
  /Transferiste\s+([\d]+(?:[.,]\d{1,2})?)\s*MT\s+e\s+a\s+taxa\s+foi\s+de\s+([\d]+(?:[.,]\d{1,2})?)\s*MT\s+para\s+(\d{6,15})\s*-\s*(.+?)\s+aos\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+as\s+(\d{1,2}:\d{2}\s*[AP]M)/i;

export const transferSentPattern = {
  type: MpesaMessageType.TRANSFER_SENT,

  test(normalizedText) {
    return TRANSFER_SENT_REGEX.test(normalizedText);
  },

  extract(normalizedText) {
    const match = normalizedText.match(TRANSFER_SENT_REGEX);
    if (!match) return null;

    const [, amountRaw, feeRaw, phone, name, dateStr, timeStr] = match;

    return {
      amount: parseAmount(amountRaw),
      fee: parseAmount(feeRaw),
      counterpartyPhone: phone,
      counterpartyName: name.trim(),
      occurredAt: parseMpesaDateTime(dateStr, timeStr),
    };
  },
};

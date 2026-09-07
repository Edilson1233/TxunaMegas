import { ParserResult } from '../core/dto/ParserResult.js';
import { PaymentProvider } from '../core/dto/PaymentProvider.js';
import { normalizeMpesaText } from './normalizeText.js';
import { parseAmount } from './parseAmount.js';
import { receivedPattern } from './patterns/receivedPattern.js';
import { transferSentPattern } from './patterns/transferSentPattern.js';

// v1.1.0 (Fase 3): passou a devolver instâncias de ParserResult (DTO
// formal) em vez de objetos literais soltos. O shape dos dados não mudou.
const PARSER_VERSION = '1.1.0';

// Extraídos fora dos padrões de tipo porque são comuns a TODAS as SMS
// M-Pesa, independentemente do tipo (Recebeste, Transferiste, futuros).
const TRANSACTION_ID_REGEX = /Confirmado\s+([A-Z0-9]{5,15})\./i;
const BALANCE_REGEX = /novo saldo M-?Pesa\s+e\s+de\s*([\d]+(?:[.,]\d{1,2})?)\s*MT/i;

// Fronteira de fecho conhecida de todas as SMS M-Pesa MZ observadas até
// agora. Tudo o que aparecer DEPOIS disto não faz parte da SMS oficial —
// é conteúdo adicional que o cliente colou/escreveu manualmente no
// WhatsApp (ex: o número de destino dos megas).
const FOOTER_BOUNDARY_REGEX = /liga\s+100\.?(?:\s*M-?Pesa\s+e\s+facil!?)?/i;

// Números de telemóvel moçambicanos têm 9 dígitos e começam por 8[2-7]
// (82=Movitel, 83/84/85=Vodacom, 86/87=Tmcel, faixas podem alargar-se no
// futuro mas o formato de 9 dígitos começando por 8 é estável).
const MZ_PHONE_TOKEN_REGEX = /\b8[2-7]\d{7}\b/;

// Ordem importa: cada padrão é testado nesta sequência até um "bater".
// Para adicionar um novo tipo de SMS (ex: "Pagamento a comerciante"),
// cria-se um novo módulo em patterns/ e regista-se aqui — nada mais neste
// ficheiro precisa de mudar.
const PATTERNS = [receivedPattern, transferSentPattern];

/**
 * MpesaParser
 * ------------
 * Orquestrador do parsing de SMS M-Pesa. Devolve sempre uma instância de
 * ParserResult (ver src/core/dto/ParserResult.js) — nunca lança exceção,
 * mesmo para texto completamente não relacionado com M-Pesa.
 */
export class MpesaParser {
  /**
   * @param {string} rawText - texto da SMS M-Pesa (ou texto colado no
   *   WhatsApp contendo essa SMS, possivelmente com um número extra
   *   anexado no fim).
   * @returns {ParserResult}
   */
  static parse(rawText) {
    const text = normalizeMpesaText(rawText);

    if (!text) {
      return ParserResult.unknown({
        provider: PaymentProvider.MPESA,
        warnings: ['texto_vazio'],
        raw: rawText,
        parserVersion: PARSER_VERSION,
      });
    }

    const matchedPattern = PATTERNS.find((pattern) => pattern.test(text));
    if (!matchedPattern) {
      return ParserResult.unknown({
        provider: PaymentProvider.MPESA,
        warnings: ['nenhum_padrao_reconhecido'],
        raw: rawText,
        parserVersion: PARSER_VERSION,
      });
    }

    const extracted = matchedPattern.extract(text);
    if (!extracted) {
      // Não deveria acontecer (test() e extract() partilham a mesma regex),
      // mas protegemo-nos contra os dois ficarem dessincronizados no futuro.
      return ParserResult.unknown({
        provider: PaymentProvider.MPESA,
        warnings: ['falha_inesperada_na_extracao'],
        raw: rawText,
        parserVersion: PARSER_VERSION,
      });
    }

    const warnings = [];

    const transactionIdMatch = text.match(TRANSACTION_ID_REGEX);
    const transactionId = transactionIdMatch ? transactionIdMatch[1] : null;
    if (!transactionId) warnings.push('transactionId_ausente');

    const balanceMatch = text.match(BALANCE_REGEX);
    const balance = balanceMatch ? parseAmount(`${balanceMatch[1]}MT`) : null;
    if (!balanceMatch) warnings.push('saldo_ausente_na_sms');

    const destinationNumber = this.#extractDestinationNumber(text);

    return ParserResult.matched({
      type: matchedPattern.type,
      provider: PaymentProvider.MPESA,
      transactionId,
      amount: extracted.amount,
      fee: extracted.fee,
      counterpartyPhone: extracted.counterpartyPhone,
      counterpartyName: extracted.counterpartyName,
      occurredAt: extracted.occurredAt,
      balance,
      destinationNumber,
      warnings,
      raw: rawText,
      parserVersion: PARSER_VERSION,
    });
  }

  /**
   * Procura um número de telemóvel moçambicano DEPOIS da fronteira de fecho
   * da SMS oficial. Se encontrado, é devolvido como "destino" (ex: para
   * onde os megas devem ir) — mesmo que coincida com o número da
   * contraparte do pagamento, já que isso não é necessariamente um acidente
   * (o cliente pode estar só a confirmar explicitamente o mesmo número).
   */
  static #extractDestinationNumber(text) {
    const boundaryMatch = text.match(FOOTER_BOUNDARY_REGEX);
    if (!boundaryMatch) return null;

    const tail = text.slice(boundaryMatch.index + boundaryMatch[0].length);
    const phoneMatch = tail.match(MZ_PHONE_TOKEN_REGEX);
    if (!phoneMatch) return null;

    const candidate = phoneMatch[0];
    return candidate;
  }
}

/**
 * normalizeMpesaText
 * --------------------
 * Normaliza o texto de entrada ANTES de qualquer regex tentar reconhecê-lo.
 * SMS reais, e sobretudo texto colado manualmente no WhatsApp por um
 * cliente, trazem variações que não têm nada a ver com o conteúdo em si:
 * espaços duplicados, tabs, quebras de linha do Windows, espaços especiais
 * (non-breaking space) que copiar/colar às vezes introduz.
 *
 * Sem esta normalização, um simples espaço duplo entre palavras já seria
 * suficiente para o parser "não reconhecer" uma mensagem válida — e isso é
 * exatamente o tipo de falha frágil que "robusto" no nome desta fase deve
 * evitar.
 */
export function normalizeMpesaText(text) {
  if (typeof text !== 'string') return '';

  return text
    .replace(/\u00a0/g, ' ') // non-breaking space -> espaço normal
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ') // colapsa espaços/tabs repetidos
    .trim();
}

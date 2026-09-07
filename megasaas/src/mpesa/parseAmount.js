/**
 * parseAmount
 * ------------
 * Converte um valor monetário em texto (ex: "301.78MT", "15,50MT", "0.00")
 * para número. Aceita tanto ponto como vírgula como separador decimal —
 * as operadoras moçambicanas usam consistentemente ponto, mas mantemos
 * tolerância a vírgula porque é um erro humano comum ao digitar/colar
 * valores manualmente (ex: se o texto vier de um app de terceiros que usa
 * localização diferente).
 *
 * @param {string|null|undefined} rawValue
 * @returns {number|null} - null se não for possível converter (nunca lança erro)
 */
export function parseAmount(rawValue) {
  if (!rawValue) return null;

  const normalized = rawValue
    .toString()
    .replace(/MT$/i, '')
    .replace(',', '.')
    .trim();

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

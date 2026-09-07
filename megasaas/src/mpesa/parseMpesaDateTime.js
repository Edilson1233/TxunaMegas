// Moçambique usa UTC+2 o ano todo (CAT — Central Africa Time), sem horário
// de verão. Fixamos este offset em vez de depender do fuso horário da
// máquina onde o código corre (que pode ser qualquer coisa, especialmente
// em produção num servidor cloud configurado em UTC).
const MAPUTO_UTC_OFFSET_MINUTES = 2 * 60;

/**
 * parseMpesaDateTime
 * --------------------
 * Converte a data/hora no formato usado pelas SMS M-Pesa moçambicanas
 * (ex: data "30/6/26" = D/M/AA, hora "12:06 AM") para uma string ISO 8601
 * em UTC.
 *
 * Nota sobre o ano de 2 dígitos: o M-Pesa MZ escreve sempre "26" para 2026,
 * nunca "2026". Assumimos século XXI (20XX) — seguro até 2099.
 *
 * @param {string} dateStr - formato "D/M/AA" ou "DD/MM/AAAA"
 * @param {string} timeStr - formato "H:MM AM" ou "HH:MM PM"
 * @returns {string|null} ISO 8601 em UTC, ou null se o formato for inválido
 */
export function parseMpesaDateTime(dateStr, timeStr) {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(dateStr ?? '');
  const timeMatch = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(timeStr ?? '');

  if (!dateMatch || !timeMatch) return null;

  const [, dayStr, monthStr, yearStr] = dateMatch;
  const [, hourStr, minuteStr, meridiem] = timeMatch;

  const day = Number(dayStr);
  const month = Number(monthStr);
  let year = Number(yearStr);
  if (yearStr.length === 2) {
    year += 2000;
  }

  let hour = Number(hourStr) % 12;
  if (meridiem.toUpperCase() === 'PM') hour += 12;
  const minute = Number(minuteStr);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Construímos o instante em UTC como se a hora local já fosse UTC, e só
  // depois subtraímos o offset de Maputo — assim evitamos qualquer
  // comportamento surpresa do fuso horário da máquina local (new Date()
  // sem "Z" depende do fuso do sistema operativo, o que é uma fonte clássica
  // de bugs "funciona na minha máquina, falha no servidor").
  const asIfUtcMillis = Date.UTC(year, month - 1, day, hour, minute);
  const realUtcMillis = asIfUtcMillis - MAPUTO_UTC_OFFSET_MINUTES * 60 * 1000;
  const date = new Date(realUtcMillis);

  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

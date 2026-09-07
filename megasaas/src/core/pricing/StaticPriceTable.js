/**
 * StaticPriceTable
 * ----------------
 * Adaptador temporario para testes locais antes da tabela editavel viver no
 * Spring Core. Formato: "15:600,30:1200" significa 15MT -> 600MB.
 */
export class StaticPriceTable {
  #entries;

  constructor(entries = new Map()) {
    this.#entries = entries;
  }

  static fromEnv(value) {
    if (!value || !value.trim()) return null;

    const entries = new Map();
    for (const item of value.split(',')) {
      const [priceRaw, allowanceRaw] = item.split(':').map((part) => part?.trim());
      const price = Number(priceRaw);
      const allowanceMb = Number(allowanceRaw);

      if (!Number.isFinite(price) || !Number.isFinite(allowanceMb) || price <= 0 || allowanceMb <= 0) {
        throw new Error(`[StaticPriceTable] entrada invalida: ${item}`);
      }

      entries.set(formatPriceKey(price), allowanceMb);
    }

    return new StaticPriceTable(entries);
  }

  resolveDeliveryAmount(paymentAmount) {
    const normalized = Number(paymentAmount);
    if (!Number.isFinite(normalized)) return null;
    return this.#entries.get(formatPriceKey(normalized)) ?? null;
  }
}

function formatPriceKey(value) {
  return Number(value).toFixed(2);
}

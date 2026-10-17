export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "MGA", "XOF"] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
  CAD: "CAD",
  AUD: "AUD",
  MGA: "Ar",
  XOF: "CFA",
};

export function getSymbol(currency: string | null | undefined): string {
  if (!currency) return "€";
  return SYMBOLS[currency] ?? currency;
}

/** Les symboles d'un seul caractère se placent avant le montant (€12.00), les autres après (12.00 CHF). */
export function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const n = Number(amount ?? 0);
  const value = (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = getSymbol(currency);
  return symbol.length === 1 ? `${symbol}${value}` : `${value} ${symbol}`;
}

export function formatRate(rate: number | string | null | undefined, currency: string | null | undefined): string {
  return `${formatMoney(rate, currency)}/h`;
}

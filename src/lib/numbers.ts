/**
 * Parse un nombre saisi par un utilisateur francophone : accepte la virgule comme
 * séparateur décimal et ignore les espaces (ex. « 1 234,50 » → 1234.5).
 * Retourne NaN si la saisie n'est pas un nombre valide.
 */
export function parseDecimal(input: unknown): number {
  if (typeof input === "number") return input;
  if (input === null || input === undefined) return NaN;
  const normalized = String(input).trim().replace(/[\s  ]/g, "").replace(",", ".");
  if (normalized === "") return NaN;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(normalized)) return NaN;
  return Number(normalized);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Montant d'une ligne de facture : quantité × prix × (1 − remise/100). */
export function lineAmount(quantity: number | string, unitPrice: number | string, discount: number | string = 0): number {
  return round2(Number(quantity) * Number(unitPrice) * (1 - Number(discount) / 100));
}

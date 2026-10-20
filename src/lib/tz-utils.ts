/**
 * Calculs de dates dans un fuseau IANA explicite, identiques côté serveur et
 * navigateur (pas de dépendance au fuseau du processus) : évite les écarts
 * d'hydratation et garantit des jours « locaux » cohérents.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  /** 0 = janvier */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = lundi … 6 = dimanche */
  weekday: number;
}

export function zonedParts(ms: number, tz: string): ZonedParts {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const year = p.year;
  const month = p.month - 1;
  const day = p.day;
  const weekday = (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
  return { year, month, day, hour: p.hour, minute: p.minute, second: p.second, weekday };
}

/** Décalage (ms) du fuseau par rapport à UTC à l'instant donné. */
export function tzOffset(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Instant (ms) correspondant à minuit du jour (y, m, d) dans le fuseau. Accepte des valeurs hors bornes (d = 32…). */
export function zonedMidnight(year: number, month: number, day: number, tz: string): number {
  const guess = Date.UTC(year, month, day);
  const off1 = tzOffset(guess, tz);
  let result = guess - off1;
  const off2 = tzOffset(result, tz);
  if (off2 !== off1) result = guess - off2;
  return result;
}

/** Clé « YYYY-MM-DD » du jour de l'instant dans le fuseau. */
export function dateKeyInTz(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Début et fin (ms) du jour contenant l'instant, dans le fuseau. */
export function dayBounds(ms: number, tz: string): [number, number] {
  const p = zonedParts(ms, tz);
  return [zonedMidnight(p.year, p.month, p.day, tz), zonedMidnight(p.year, p.month, p.day + 1, tz)];
}

/** « YYYY-MM-DD » (+ décalage en jours) → instant ISO du minuit correspondant dans le fuseau. */
export function dateToZonedIso(date: string, tz: string, addDays = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(zonedMidnight(y, m - 1, d + addDays, tz)).toISOString();
}

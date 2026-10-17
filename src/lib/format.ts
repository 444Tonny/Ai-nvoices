/** Durée en secondes → « HH:mm:ss ». */
export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Durée en secondes → « 3h 25m » (ou « 0h 00m »). */
export function formatHoursMinutes(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Durée en secondes → heures décimales (2 décimales). */
export function secondsToHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

/** Date seule « YYYY-MM-DD » → « JJ/MM/AAAA » (sans conversion de fuseau). */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/**
 * Formate un instant. `tz` (fuseau IANA) rend le résultat identique côté serveur
 * et navigateur ; sans `tz`, le fuseau du runtime est utilisé.
 */
export function formatDate(value: string | Date | null | undefined, tz?: string): string {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz });
}

export function formatDateTime(value: string | Date | null | undefined, tz?: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });
}

export function formatTime(value: string | Date | null | undefined, tz?: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

/** Date locale (fuseau du navigateur) → « YYYY-MM-DD ». */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date locale (fuseau du navigateur) → valeur pour <input type="datetime-local">. */
export function toDateTimeLocal(d: Date): string {
  return `${toDateKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Durée d'une entrée en secondes (entrée en cours comptée jusqu'à `now`). */
export function entrySeconds(start: string, end: string | null, now: number = Date.now()): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : now;
  return Math.max(0, (e - s) / 1000);
}

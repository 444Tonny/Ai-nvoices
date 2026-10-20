import "server-only";
import { cookies } from "next/headers";

export const TZ_COOKIE = "ainv-tz";
export const DEFAULT_TZ = "Europe/Paris";

/** Fuseau IANA de l'utilisateur, transmis par le navigateur via un cookie. */
export async function getUserTimezone(): Promise<string> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  if (!value) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TZ;
  }
}

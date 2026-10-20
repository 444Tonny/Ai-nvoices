import { supabaseKey, supabaseUrl } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase agissant au nom du propriétaire d'un jeton d'accès personnel
 * (serveur MCP). Le jeton part dans l'en-tête `x-ainv-token` : la fonction SQL
 * app_uid() le vérifie, donc toutes les policies RLS s'appliquent exactement
 * comme pour une session de l'app. Aucune clé service_role n'est utilisée.
 */
export function createClientWithPersonalToken(token: string) {
  return createClient(supabaseUrl(), supabaseKey(), {
    global: { headers: { "x-ainv-token": token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Extrait le jeton d'une requête : `Authorization: Bearer ainv_…` ou `x-ainv-token`. */
export function tokenFromRequest(headers: Headers): string | null {
  const auth = headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = bearer ?? headers.get("x-ainv-token");
  return token && token.startsWith("ainv_") ? token : null;
}

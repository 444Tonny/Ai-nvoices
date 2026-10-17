import { createClient } from "@supabase/supabase-js";

/**
 * PRÉPARATION MCP : client Supabase agissant au nom d'un utilisateur à partir
 * de son jeton d'accès (JWT Supabase), sans cookies.
 *
 * Le futur serveur MCP recevra un jeton « Authorization: Bearer … » ; ce client
 * le transmet à PostgREST, donc toutes les policies RLS s'appliquent exactement
 * comme dans l'app web. Aucune clé service_role n'est utilisée.
 */
export function createClientWithAccessToken(accessToken: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

import { supabaseKey, supabaseUrl } from "@/lib/env";
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Client Supabase pour Server Components, Server Actions et Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl(),
    supabaseKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    },
  );
}

/** Retourne le client et l'utilisateur courant, ou lève une erreur si non connecté. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  return { supabase, user };
}

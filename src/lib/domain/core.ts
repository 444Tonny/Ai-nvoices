import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase déjà authentifié (session utilisateur via cookies dans l'app web,
 * ou jeton utilisateur côté futur serveur MCP). Toute la couche domaine passe par
 * lui : la RLS garantit l'isolation des données par utilisateur.
 */
export type DB = SupabaseClient;

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

interface PgError {
  message: string;
  code?: string;
  details?: string | null;
}

/** Traduit les erreurs Postgres/PostgREST en messages lisibles en français. */
export function translateError(error: PgError): string {
  switch (error.code) {
    case "23505":
      if (error.message.includes("invoices_user_id_number_key")) return "Ce numéro de facture existe déjà.";
      if (error.message.includes("time_entries_one_running_per_user")) return "Un timer est déjà en cours.";
      return "Cet élément existe déjà.";
    case "23503":
      return "Élément lié introuvable.";
    case "23514":
      return "Valeur invalide.";
    case "PGRST116":
      return "Élément introuvable.";
    default:
      return error.message || "Erreur inattendue";
  }
}

/** Déballe une réponse Supabase et lève une DomainError en cas d'échec. */
export function must<T>(res: { data: T | null; error: PgError | null }): T {
  if (res.error) throw new DomainError(translateError(res.error));
  return res.data as T;
}

/** Variante qui tolère l'absence de données (retourne null). */
export function maybe<T>(res: { data: T | null; error: PgError | null }): T | null {
  if (res.error) throw new DomainError(translateError(res.error));
  return res.data;
}

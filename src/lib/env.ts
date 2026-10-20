/**
 * Variables d'environnement publiques de Supabase.
 *
 * Accepte les deux noms de clé publique : `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * (historique) et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nouveau format, posé
 * notamment par l'intégration Supabase de Vercel).
 * Les accès restent littéraux pour que Next.js les injecte côté navigateur.
 */
export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("Variable manquante : NEXT_PUBLIC_SUPABASE_URL (voir README, section Déploiement).");
  return value;
}

export function supabaseKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error(
      "Variable manquante : NEXT_PUBLIC_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (voir README, section Déploiement).",
    );
  }
  return value;
}

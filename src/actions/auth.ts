"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultTemplate } from "@/lib/domain/templates";

export interface AuthState {
  error?: string;
  message?: string;
}

/**
 * URL de base pour les liens envoyés par email.
 * - Déploiements de prévisualisation Vercel : hôte de la requête (chaque preview a sa propre URL).
 * - Sinon : NEXT_PUBLIC_SITE_URL, puis le domaine de production Vercel, puis l'hôte de la requête.
 */
async function siteUrl() {
  const isPreview = process.env.VERCEL_ENV === "preview";
  if (!isPreview && process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (!isPreview && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email ou mot de passe incorrect.";
  if (/email not confirmed/i.test(message)) return "Adresse email non confirmée. Vérifiez votre boîte mail.";
  if (/already registered/i.test(message)) return "Un compte existe déjà avec cet email.";
  if (/password should be at least/i.test(message)) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (/rate limit/i.test(message)) return "Trop de tentatives, réessayez dans quelques minutes.";
  return message;
}

/** Page interne où revenir après connexion (champ caché « next »). */
function nextPath(formData: FormData): string {
  const v = String(formData.get("next") ?? "");
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const callbackUrl = async (formData: FormData) => {
  const next = nextPath(formData);
  return `${await siteUrl()}/auth/callback${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;
};

export async function signInWithPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email et mot de passe requis." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translateAuthError(error.message) };
  await ensureDefaultTemplate(supabase).catch(() => undefined);
  redirect(nextPath(formData));
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email et mot de passe requis." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await callbackUrl(formData) },
  });
  if (error) return { error: translateAuthError(error.message) };
  if (data.session) {
    await ensureDefaultTemplate(supabase).catch(() => undefined);
    redirect(nextPath(formData));
  }
  return { message: "Compte créé. Confirmez votre adresse via le lien reçu par email." };
}

export async function signInWithMagicLink(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email requis." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl(formData) },
  });
  if (error) return { error: translateAuthError(error.message) };
  return { message: "Lien de connexion envoyé. Consultez votre boîte mail." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

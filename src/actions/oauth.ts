"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { randomToken, resolveClient, sha256Hex, SCOPE } from "@/lib/oauth";

/** Accord ou refus de l'utilisateur sur la page de consentement OAuth. */
export async function oauthDecisionAction(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const state = get("state");
  const challenge = get("code_challenge");
  const decision = get("decision");

  // Revalidation complète : le formulaire peut avoir été modifié.
  const client = await resolveClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri) || !challenge) {
    throw new Error("Demande d'autorisation invalide.");
  }

  const target = new URL(redirectUri);
  if (state) target.searchParams.set("state", state);

  if (decision !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const code = randomToken("ainv_code_");
  const { error } = await supabase.rpc("oauth_create_code", {
    p_code_hash: sha256Hex(code),
    p_client_id: clientId,
    p_redirect_uri: redirectUri,
    p_code_challenge: challenge,
    p_scope: SCOPE,
  });
  if (error) throw new Error(`Autorisation impossible : ${error.message}`);

  target.searchParams.set("code", code);
  redirect(target.toString());
}

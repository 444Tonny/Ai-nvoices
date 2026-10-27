import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/env";

/** Durée de vie d'un jeton d'accès OAuth (renouvelable). */
export const ACCESS_TOKEN_TTL = 30 * 24 * 3600;
export const SCOPE = "mcp";

export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");
/** PKCE S256 : BASE64URL(SHA256(code_verifier)). */
export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const randomToken = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** URL publique de l'app (issuer OAuth) : celle de la requête, derrière le proxy Vercel. */
export function originOf(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Client Supabase anonyme : les fonctions OAuth sont security definer. */
export function anonDb() {
  return createClient(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-protocol-version",
      ...extra,
    },
  });
}

export function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-protocol-version",
    },
  });
}

export interface OAuthClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
}

/**
 * Résout un client : enregistré dynamiquement (DCR), ou identifié par l'URL
 * de son document de métadonnées (CIMD), qui est alors récupéré et vérifié.
 */
export async function resolveClient(clientId: string): Promise<OAuthClient | null> {
  const db = anonDb();
  if (/^https:\/\//.test(clientId)) {
    try {
      const res = await fetch(clientId, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length > 20_000) return null;
      const doc = JSON.parse(text) as { client_id?: string; client_name?: string; redirect_uris?: string[] };
      if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0) return null;
      const { error } = await db.rpc("oauth_register_client", {
        p_client_id: clientId,
        p_name: doc.client_name ?? new URL(clientId).host,
        p_redirect_uris: doc.redirect_uris,
        p_secret_hash: null,
        p_is_metadata_document: true,
      });
      if (error) return null;
      return { client_id: clientId, client_name: doc.client_name ?? new URL(clientId).host, redirect_uris: doc.redirect_uris };
    } catch {
      return null;
    }
  }
  const { data } = await db.rpc("oauth_get_client", { p_client_id: clientId });
  if (!data) return null;
  const c = data as OAuthClient;
  return { client_id: c.client_id, client_name: c.client_name, redirect_uris: c.redirect_uris };
}

/** Métadonnées du serveur d'autorisation (RFC 8414). */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
  };
}

/** Métadonnées de la ressource protégée (RFC 9728). */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "AI-nvoices",
  };
}

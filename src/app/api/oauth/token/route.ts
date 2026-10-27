import { ACCESS_TOKEN_TTL, anonDb, cors, json, randomToken, s256, sha256Hex, SCOPE } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Lit les paramètres (form-urlencoded, ou JSON par tolérance). */
async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await request.text());
}

/** Identifiants du client : en-tête Basic ou paramètres du corps. */
function clientCredentials(request: Request, params: URLSearchParams): { clientId: string | null; secret: string | null } {
  const basic = request.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, "base64").toString("utf8").split(":");
    return { clientId: decodeURIComponent(id ?? ""), secret: secret ? decodeURIComponent(secret) : null };
  }
  return { clientId: params.get("client_id"), secret: params.get("client_secret") };
}

const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

/** Point d'échange de jetons : authorization_code (PKCE) et refresh_token. */
export async function POST(request: Request) {
  const params = await readParams(request);
  const { clientId, secret } = clientCredentials(request, params);
  if (!clientId) return oauthError("invalid_client", "client_id manquant", 401);

  const grant = params.get("grant_type");
  const access = randomToken("ainv_");
  const refresh = randomToken("ainv_refresh_");
  const db = anonDb();

  let result: { ok?: boolean; error?: string; scope?: string } | null = null;
  if (grant === "authorization_code") {
    const code = params.get("code");
    const verifier = params.get("code_verifier");
    const redirectUri = params.get("redirect_uri");
    if (!code || !verifier || !redirectUri) return oauthError("invalid_request", "code, code_verifier et redirect_uri requis");
    const { data, error } = await db.rpc("oauth_exchange_code", {
      p_code_hash: sha256Hex(code),
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_verifier_challenge: s256(verifier),
      p_secret_hash: secret ? sha256Hex(secret) : null,
      p_access_hash: sha256Hex(access),
      p_access_prefix: access.slice(0, 12),
      p_refresh_hash: sha256Hex(refresh),
      p_ttl_seconds: ACCESS_TOKEN_TTL,
    });
    if (error) return oauthError("server_error", error.message, 500);
    result = data;
  } else if (grant === "refresh_token") {
    const token = params.get("refresh_token");
    if (!token) return oauthError("invalid_request", "refresh_token requis");
    const { data, error } = await db.rpc("oauth_refresh", {
      p_refresh_hash: sha256Hex(token),
      p_client_id: clientId,
      p_secret_hash: secret ? sha256Hex(secret) : null,
      p_access_hash: sha256Hex(access),
      p_access_prefix: access.slice(0, 12),
      p_new_refresh_hash: sha256Hex(refresh),
      p_ttl_seconds: ACCESS_TOKEN_TTL,
    });
    if (error) return oauthError("server_error", error.message, 500);
    result = data;
  } else {
    return oauthError("unsupported_grant_type", "grant_type non supporté");
  }

  if (!result?.ok) {
    return result?.error === "invalid_client"
      ? oauthError("invalid_client", "Client inconnu ou secret invalide", 401)
      : oauthError("invalid_grant", "Code ou jeton invalide, expiré ou déjà utilisé");
  }

  return json({
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refresh,
    scope: result.scope ?? SCOPE,
  });
}

export const OPTIONS = cors;

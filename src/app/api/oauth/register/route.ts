import { anonDb, cors, json, randomToken, sha256Hex } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** Enregistrement dynamique d'un client OAuth (RFC 7591). */
export async function POST(request: Request) {
  let body: {
    redirect_uris?: unknown;
    client_name?: unknown;
    token_endpoint_auth_method?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Corps JSON invalide" }, 400);
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0) return json({ error: "invalid_redirect_uri", error_description: "redirect_uris requis" }, 400);

  const authMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
    return json({ error: "invalid_client_metadata", error_description: "token_endpoint_auth_method non supportée" }, 400);
  }
  const clientName = typeof body.client_name === "string" ? body.client_name : "Client MCP";
  const secret = authMethod === "none" ? null : randomToken("ainv_secret_");

  const { data: clientId, error } = await anonDb().rpc("oauth_register_client", {
    p_client_id: null,
    p_name: clientName,
    p_redirect_uris: redirectUris,
    p_secret_hash: secret ? sha256Hex(secret) : null,
    p_is_metadata_document: false,
  });
  if (error || !clientId) return json({ error: "invalid_client_metadata", error_description: error?.message ?? "Enregistrement impossible" }, 400);

  return json(
    {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

export const OPTIONS = cors;

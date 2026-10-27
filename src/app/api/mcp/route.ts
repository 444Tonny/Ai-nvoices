import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClientWithPersonalToken, tokenFromRequest } from "@/lib/supabase/token";
import { buildMcpServer } from "@/lib/mcp/server";
import { originOf } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 401 qui indique au client où trouver le serveur d'autorisation OAuth (RFC 9728). */
function unauthorized(request: Request, message: string) {
  const metadata = `${originOf(request)}/.well-known/oauth-protected-resource`;
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="ai-nvoices", resource_metadata="${metadata}"`,
      "Access-Control-Expose-Headers": "WWW-Authenticate",
    },
  });
}

/**
 * Serveur MCP (Streamable HTTP, sans état : compatible serverless).
 * Authentification : `Authorization: Bearer <jeton ainv_…>` créé dans Paramètres.
 */
async function handle(request: Request): Promise<Response> {
  const token = tokenFromRequest(request.headers);
  if (!token) return unauthorized(request, "Jeton manquant : ajoutez l'en-tête Authorization: Bearer ainv_…");

  const db = createClientWithPersonalToken(token);
  const { data: who, error } = await db.rpc("token_whoami");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  if (!who) return unauthorized(request, "Jeton invalide ou révoqué.");

  const server = buildMcpServer(db, { email: (who as { email: string | null }).email });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

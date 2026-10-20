import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClientWithPersonalToken, tokenFromRequest } from "@/lib/supabase/token";
import { buildMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="ai-nvoices"' },
  });
}

/**
 * Serveur MCP (Streamable HTTP, sans état : compatible serverless).
 * Authentification : `Authorization: Bearer <jeton ainv_…>` créé dans Paramètres.
 */
async function handle(request: Request): Promise<Response> {
  const token = tokenFromRequest(request.headers);
  if (!token) return unauthorized("Jeton manquant : ajoutez l'en-tête Authorization: Bearer ainv_…");

  const db = createClientWithPersonalToken(token);
  const { data: who, error } = await db.rpc("token_whoami");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  if (!who) return unauthorized("Jeton invalide ou révoqué.");

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

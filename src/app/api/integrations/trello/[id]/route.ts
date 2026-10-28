import { anonDb, sha256Hex } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trello vérifie l'URL par un HEAD à la création du webhook. */
export function HEAD() {
  return new Response(null, { status: 200 });
}

export function GET() {
  return new Response("ok", { status: 200 });
}

/**
 * Webhook Trello : chaque action du tableau arrive ici. L'URL porte le secret du
 * tableau ; trello_ingest() le vérifie et crée ou met à jour la tâche.
 * 410 = webhook inconnu ou révoqué : Trello le supprime de lui-même.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const secret = new URL(request.url).searchParams.get("s");
  if (!UUID.test(id) || !secret) return new Response(null, { status: 410 });

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body.action) return new Response(null, { status: 200 });

  const { data, error } = await anonDb().rpc("trello_ingest", { p_board: id, p_secret_hash: sha256Hex(secret), p_action: body.action });
  if (error) {
    console.error("trello_ingest", error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: data === "unknown" ? 410 : 200 });
}

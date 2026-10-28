import { createHash, randomBytes } from "node:crypto";
import { DomainError, maybe, must, type DB } from "./core";

/**
 * Intégration Trello : un tableau synchronisé reçoit un webhook Trello pointant vers
 * /api/integrations/trello/<id>?s=<secret> ; chaque carte devient une tâche
 * (création, renommage, déplacement de liste → statut, échéance), via trello_ingest().
 */

const API = "https://api.trello.com/1";

interface Creds {
  api_key: string;
  token: string;
}

export interface TrelloConnection {
  member_name: string | null;
  created_at: string;
}

export interface TrelloBoardState {
  board_id: string;
  name: string;
  url: string;
  /** Ligne trello_boards si le tableau est synchronisé. */
  sync: { id: string; project_id: string | null; created_at: string } | null;
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  shortLink: string;
  idList: string;
  closed: boolean;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Appel de l'API Trello (jeton en en-tête, jamais dans l'URL). */
async function trello<T>(creds: Creds, path: string, init: { method?: string; params?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(init.params ?? {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Authorization: `OAuth oauth_consumer_key="${creds.api_key}", oauth_token="${creds.token}"`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new DomainError("Trello ne répond pas. Réessayez dans un instant.");
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    if (res.status === 401) throw new DomainError("Trello refuse la clé API ou le jeton : vérifiez-les.");
    if (res.status === 404 && init.method === "DELETE") return undefined as T;
    throw new DomainError(`Trello : ${text || `erreur ${res.status}`}`);
  }
  const body = await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

async function creds(db: DB): Promise<Creds> {
  const row = maybe(await db.from("trello_connections").select("api_key, token").maybeSingle()) as Creds | null;
  if (!row) throw new DomainError("Connectez d'abord votre compte Trello.");
  return row;
}

export async function getTrelloConnection(db: DB): Promise<TrelloConnection | null> {
  return maybe(await db.from("trello_connections").select("member_name, created_at").maybeSingle());
}

/** Vérifie la clé et le jeton auprès de Trello puis les enregistre. */
export async function connectTrello(db: DB, apiKey: string, token: string): Promise<TrelloConnection> {
  const me = await trello<{ fullName: string; username: string }>({ api_key: apiKey, token }, "/members/me", { params: { fields: "fullName,username" } });
  const member_name = me.fullName ? `${me.fullName} (@${me.username})` : `@${me.username}`;
  return must(
    await db.from("trello_connections").upsert({ api_key: apiKey, token, member_name }).select("member_name, created_at").single(),
  ) as TrelloConnection;
}

/** Supprime les webhooks Trello, les tableaux synchronisés et la connexion. Les tâches restent. */
export async function disconnectTrello(db: DB): Promise<void> {
  const c = maybe(await db.from("trello_connections").select("api_key, token").maybeSingle()) as Creds | null;
  const boards = must(await db.from("trello_boards").select("id, webhook_id")) as { id: string; webhook_id: string | null }[];
  if (c) {
    await Promise.allSettled(boards.filter((b) => b.webhook_id).map((b) => trello(c, `/webhooks/${b.webhook_id}`, { method: "DELETE" })));
  }
  if (boards.length) must(await db.from("trello_boards").delete().in("id", boards.map((b) => b.id)));
  must(await db.from("trello_connections").delete().not("user_id", "is", null));
}

/** Tableaux Trello ouverts de l'utilisateur, avec leur état de synchronisation. */
export async function listTrelloBoards(db: DB): Promise<TrelloBoardState[]> {
  const c = await creds(db);
  const [boards, synced] = await Promise.all([
    trello<{ id: string; name: string; url: string }[]>(c, "/members/me/boards", { params: { filter: "open", fields: "name,url" } }),
    db.from("trello_boards").select("id, board_id, project_id, created_at"),
  ]);
  const rows = must(synced) as { id: string; board_id: string; project_id: string | null; created_at: string }[];
  return boards
    .map((b) => {
      const row = rows.find((r) => r.board_id === b.id);
      return { board_id: b.id, name: b.name, url: b.url, sync: row ? { id: row.id, project_id: row.project_id, created_at: row.created_at } : null };
    })
    .sort((a, b) => Number(Boolean(b.sync)) - Number(Boolean(a.sync)) || a.name.localeCompare(b.name, "fr"));
}

/** Rejoue une carte comme une action « createCard » (import et webhooks partagent la même logique SQL). */
async function ingest(db: DB, rowId: string, secretHash: string, card: TrelloCard, listName: string | undefined): Promise<string> {
  const { data, error } = await db.rpc("trello_ingest", {
    p_board: rowId,
    p_secret_hash: secretHash,
    p_action: { type: "createCard", data: { card, list: listName ? { name: listName } : undefined } },
  });
  if (error) throw new DomainError(error.message);
  return data as string;
}

/**
 * Active la synchronisation d'un tableau : projet cible (existant ou créé au nom du tableau),
 * webhook Trello, puis import facultatif des cartes ouvertes.
 */
export async function enableTrelloBoard(
  db: DB,
  input: { boardId: string; projectId: string | null; importExisting: boolean },
  origin: string,
): Promise<{ imported: number }> {
  const c = await creds(db);
  const board = await trello<{ id: string; name: string }>(c, `/boards/${input.boardId}`, { params: { fields: "name" } });

  let projectId = input.projectId;
  if (!projectId) {
    const existing = maybe(await db.from("projects").select("id").eq("name", board.name).eq("archived", false).limit(1).maybeSingle()) as { id: string } | null;
    projectId = existing?.id ?? (must(await db.from("projects").insert({ name: board.name }).select("id").single()) as { id: string }).id;
  }

  const secret = randomBytes(24).toString("base64url");
  const row = must(
    await db.from("trello_boards").insert({ board_id: board.id, board_name: board.name, project_id: projectId, secret_hash: sha256(secret) }).select("id").single(),
  ) as { id: string };

  try {
    const hook = await trello<{ id: string }>(c, "/webhooks", {
      method: "POST",
      params: {
        idModel: board.id,
        callbackURL: `${origin}/api/integrations/trello/${row.id}?s=${secret}`,
        description: `AI-nvoices · ${board.name}`,
      },
    });
    must(await db.from("trello_boards").update({ webhook_id: hook.id }).eq("id", row.id));
  } catch (e) {
    await db.from("trello_boards").delete().eq("id", row.id);
    if (origin.includes("localhost")) throw new DomainError("Trello ne peut pas joindre localhost : activez la synchronisation depuis le site en ligne.");
    throw e;
  }

  let imported = 0;
  if (input.importExisting) {
    const [lists, cards] = await Promise.all([
      trello<{ id: string; name: string }[]>(c, `/boards/${board.id}/lists`, { params: { fields: "name" } }),
      trello<TrelloCard[]>(c, `/boards/${board.id}/cards/open`, { params: { fields: "name,desc,due,dueComplete,shortLink,idList,closed" } }),
    ]);
    const listName = new Map(lists.map((l) => [l.id, l.name]));
    for (const card of cards) {
      if ((await ingest(db, row.id, sha256(secret), card, listName.get(card.idList))) === "created") imported++;
    }
  }
  return { imported };
}

/** Arrête la synchronisation d'un tableau (les tâches déjà créées restent). */
export async function disableTrelloBoard(db: DB, id: string): Promise<void> {
  const row = maybe(await db.from("trello_boards").select("id, webhook_id").eq("id", id).maybeSingle()) as { id: string; webhook_id: string | null } | null;
  if (!row) return;
  const c = maybe(await db.from("trello_connections").select("api_key, token").maybeSingle()) as Creds | null;
  if (c && row.webhook_id) await trello(c, `/webhooks/${row.webhook_id}`, { method: "DELETE" }).catch(() => undefined);
  must(await db.from("trello_boards").delete().eq("id", id));
}

export async function setTrelloBoardProject(db: DB, id: string, projectId: string | null): Promise<void> {
  must(await db.from("trello_boards").update({ project_id: projectId }).eq("id", id));
}

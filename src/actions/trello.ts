"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { parse, run } from "./_run";
import { idSchema } from "@/lib/domain/schemas";
import { connectTrello, disableTrelloBoard, disconnectTrello, enableTrelloBoard, listTrelloBoards, setTrelloBoardProject } from "@/lib/domain/trello";

const credSchema = z.object({
  apiKey: z.string().trim().regex(/^[0-9a-f]{32}$/i, "Clé API invalide (32 caractères hexadécimaux)."),
  token: z.string().trim().min(32, "Jeton invalide.").max(200),
});
const boardIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Tableau invalide.");
const projectSchema = z.union([idSchema, z.null()]);

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function connectTrelloAction(apiKey: string, token: string) {
  return run(async (db) => {
    const input = parse(credSchema, { apiKey, token });
    return connectTrello(db, input.apiKey, input.token);
  });
}

export async function disconnectTrelloAction() {
  return run((db) => disconnectTrello(db));
}

export async function listTrelloBoardsAction() {
  return run((db) => listTrelloBoards(db));
}

/** projectId null : projet existant du même nom que le tableau, sinon créé. */
export async function enableTrelloBoardAction(boardId: string, projectId: string | null, importExisting: boolean) {
  const base = await origin();
  return run((db) =>
    enableTrelloBoard(db, { boardId: parse(boardIdSchema, boardId), projectId: parse(projectSchema, projectId), importExisting: Boolean(importExisting) }, base),
  );
}

export async function disableTrelloBoardAction(id: string) {
  return run((db) => disableTrelloBoard(db, parse(idSchema, id)));
}

export async function setTrelloBoardProjectAction(id: string, projectId: string | null) {
  return run((db) => setTrelloBoardProject(db, parse(idSchema, id), parse(projectSchema, projectId)));
}

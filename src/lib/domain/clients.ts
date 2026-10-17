import type { Client } from "@/lib/types";
import { must, maybe, type DB } from "./core";
import type { ClientInput } from "./schemas";

export async function listClients(db: DB): Promise<Client[]> {
  return must(await db.from("clients").select("*").order("name"));
}

export async function getClient(db: DB, id: string): Promise<Client | null> {
  return maybe(await db.from("clients").select("*").eq("id", id).maybeSingle());
}

export async function createClient(db: DB, input: ClientInput): Promise<Client> {
  return must(await db.from("clients").insert(input).select().single());
}

export async function updateClient(db: DB, id: string, input: ClientInput): Promise<Client> {
  return must(await db.from("clients").update(input).eq("id", id).select().single());
}

export async function deleteClients(db: DB, ids: string[]): Promise<void> {
  must(await db.from("clients").delete().in("id", ids));
}

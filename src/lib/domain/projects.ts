import type { ProjectWithClient } from "@/lib/types";
import { must, maybe, type DB } from "./core";
import type { ProjectInput } from "./schemas";

const SELECT = "*, client:clients(id, name, hourly_rate, currency)";

export async function listProjects(db: DB, opts: { clientId?: string } = {}): Promise<ProjectWithClient[]> {
  let q = db.from("projects").select(SELECT).order("name");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  return must(await q) as ProjectWithClient[];
}

export async function getProject(db: DB, id: string): Promise<ProjectWithClient | null> {
  return maybe(await db.from("projects").select(SELECT).eq("id", id).maybeSingle()) as ProjectWithClient | null;
}

export async function createProject(db: DB, input: ProjectInput): Promise<ProjectWithClient> {
  return must(await db.from("projects").insert(input).select(SELECT).single()) as ProjectWithClient;
}

export async function updateProject(db: DB, id: string, input: ProjectInput): Promise<ProjectWithClient> {
  return must(await db.from("projects").update(input).eq("id", id).select(SELECT).single()) as ProjectWithClient;
}

export async function deleteProjects(db: DB, ids: string[]): Promise<void> {
  must(await db.from("projects").delete().in("id", ids));
}

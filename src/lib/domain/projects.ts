import type { ProjectSummary, ProjectWithClient, TaskStatus } from "@/lib/types";
import { round2 } from "@/lib/numbers";
import { must, maybe, type DB } from "./core";
import type { ProjectInput } from "./schemas";

const SELECT = "*, client:clients(id, name, hourly_rate, currency)";

function normalize(p: ProjectWithClient): ProjectWithClient {
  return {
    ...p,
    hourly_rate: p.hourly_rate === null ? null : Number(p.hourly_rate),
    client: p.client ? { ...p.client, hourly_rate: Number(p.client.hourly_rate) } : null,
  };
}

export async function listProjects(db: DB, opts: { clientId?: string; includeArchived?: boolean } = {}): Promise<ProjectWithClient[]> {
  let q = db.from("projects").select(SELECT).order("archived").order("name");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (!opts.includeArchived) q = q.eq("archived", false);
  return (must(await q) as ProjectWithClient[]).map(normalize);
}

export async function getProject(db: DB, id: string): Promise<ProjectWithClient | null> {
  const p = maybe(await db.from("projects").select(SELECT).eq("id", id).maybeSingle()) as ProjectWithClient | null;
  return p ? normalize(p) : null;
}

/** Projets avec statistiques : temps total, temps et montant à facturer, tâches par statut. */
export async function listProjectSummaries(
  db: DB,
  opts: { clientId?: string; includeArchived?: boolean; ids?: string[] } = {},
): Promise<ProjectSummary[]> {
  let projects = await listProjects(db, opts);
  if (opts.ids) projects = projects.filter((p) => opts.ids!.includes(p.id));
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);

  const [tasksRes, unbilledRes] = await Promise.all([
    db.from("tasks").select("id, project_id, status").in("project_id", ids),
    db.from("unbilled_entries").select("project_id, seconds, rate").in("project_id", ids),
  ]);
  const tasks = must(tasksRes) as { id: string; project_id: string; status: TaskStatus }[];
  const totals = tasks.length
    ? (must(await db.from("task_totals").select("task_id, total_seconds").in("task_id", tasks.map((t) => t.id))) as {
        task_id: string;
        total_seconds: number;
      }[])
    : [];
  const totalByTask = new Map(totals.map((t) => [t.task_id, Number(t.total_seconds)]));
  const unbilled = must(unbilledRes) as { project_id: string; seconds: number; rate: number }[];

  return projects.map((p) => {
    const ptasks = tasks.filter((t) => t.project_id === p.id);
    const counts: Record<TaskStatus, number> = { todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const t of ptasks) counts[t.status] += 1;
    const pun = unbilled.filter((u) => u.project_id === p.id);
    const unbilledSeconds = pun.reduce((s, u) => s + Number(u.seconds), 0);
    return {
      ...p,
      rate: p.hourly_rate ?? p.client?.hourly_rate ?? 0,
      currency: p.client?.currency ?? "EUR",
      total_seconds: ptasks.reduce((s, t) => s + (totalByTask.get(t.id) ?? 0), 0),
      unbilled_seconds: unbilledSeconds,
      unbilled_amount: round2(pun.reduce((s, u) => s + (Number(u.seconds) / 3600) * Number(u.rate), 0)),
      task_counts: counts,
    };
  });
}

export async function getProjectSummary(db: DB, id: string): Promise<ProjectSummary | null> {
  const p = await getProject(db, id);
  if (!p) return null;
  const [summary] = await listProjectSummaries(db, { ids: [id], includeArchived: true, clientId: p.client_id ?? undefined });
  return summary ?? null;
}

export async function createProject(db: DB, input: ProjectInput): Promise<ProjectWithClient> {
  return normalize(must(await db.from("projects").insert(input).select(SELECT).single()) as ProjectWithClient);
}

export async function updateProject(db: DB, id: string, input: Partial<ProjectInput>): Promise<ProjectWithClient> {
  return normalize(must(await db.from("projects").update(input).eq("id", id).select(SELECT).single()) as ProjectWithClient);
}

export async function deleteProjects(db: DB, ids: string[]): Promise<void> {
  must(await db.from("projects").delete().in("id", ids));
}

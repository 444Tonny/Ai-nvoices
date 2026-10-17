import type { Task, TaskRow } from "@/lib/types";
import { must, maybe, type DB } from "./core";
import type { TaskInput } from "./schemas";

const SELECT = "*, project:projects(id, name, client:clients(id, name, hourly_rate, currency))";

interface RawTask extends Task {
  project: { id: string; name: string; client: TaskRow["client"] } | null;
}

interface TotalRow {
  task_id: string;
  total_seconds: number | string;
  last_entry_at: string | null;
  is_running: boolean | null;
}

/**
 * Liste les tâches enrichies (projet, client, temps total, statut de facturation).
 * Filtres facultatifs par projet, client ou liste d'identifiants.
 */
export async function listTaskRows(
  db: DB,
  opts: { projectId?: string; clientId?: string; ids?: string[] } = {},
): Promise<TaskRow[]> {
  let q = db.from("tasks").select(SELECT).order("created_at", { ascending: false });
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.ids) q = q.in("id", opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (opts.clientId) {
    const projects = must(await db.from("projects").select("id").eq("client_id", opts.clientId)) as { id: string }[];
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) return [];
    q = q.in("project_id", projectIds);
  }

  const tasks = must(await q) as RawTask[];
  if (tasks.length === 0) return [];
  const taskIds = tasks.map((t) => t.id);

  const [totals, invoiced] = await Promise.all([
    db.from("task_totals").select("task_id, total_seconds, last_entry_at, is_running").in("task_id", taskIds),
    db.from("invoice_items").select("task_id").in("task_id", taskIds),
  ]);
  const totalsById = new Map((must(totals) as TotalRow[]).map((r) => [r.task_id, r]));
  const invoicedIds = new Set((must(invoiced) as { task_id: string }[]).map((r) => r.task_id));

  return tasks.map((t) => {
    const tot = totalsById.get(t.id);
    return {
      ...t,
      project: t.project ? { id: t.project.id, name: t.project.name } : null,
      client: t.project?.client
        ? { ...t.project.client, hourly_rate: Number(t.project.client.hourly_rate) }
        : null,
      total_seconds: Number(tot?.total_seconds ?? 0),
      last_entry_at: tot?.last_entry_at ?? null,
      is_running: Boolean(tot?.is_running),
      is_invoiced: invoicedIds.has(t.id),
    };
  });
}

export async function getTaskRow(db: DB, id: string): Promise<TaskRow | null> {
  const rows = await listTaskRows(db, { ids: [id] });
  return rows[0] ?? null;
}

export interface RecentTask {
  id: string;
  name: string;
  project_name: string | null;
  client_name: string | null;
}

/** Les N tâches les plus récentes (dernière entrée de temps, sinon date de création). */
export async function listRecentTasks(db: DB, limit = 20): Promise<RecentTask[]> {
  const rows = await listTaskRows(db);
  return rows
    .filter((t) => !t.is_completed)
    .sort((a, b) => {
      const ka = a.last_entry_at ?? a.created_at;
      const kb = b.last_entry_at ?? b.created_at;
      return kb.localeCompare(ka);
    })
    .slice(0, limit)
    .map((t) => ({ id: t.id, name: t.name, project_name: t.project?.name ?? null, client_name: t.client?.name ?? null }));
}

export async function createTask(db: DB, input: TaskInput): Promise<Task> {
  return must(await db.from("tasks").insert(input).select().single());
}

export async function updateTask(db: DB, id: string, input: TaskInput): Promise<Task> {
  return must(await db.from("tasks").update(input).eq("id", id).select().single());
}

export async function setTaskCompleted(db: DB, id: string, isCompleted: boolean): Promise<void> {
  must(await db.from("tasks").update({ is_completed: isCompleted }).eq("id", id));
}

export async function deleteTasks(db: DB, ids: string[]): Promise<void> {
  must(await db.from("tasks").delete().in("id", ids));
}

export async function getTask(db: DB, id: string): Promise<Task | null> {
  return maybe(await db.from("tasks").select("*").eq("id", id).maybeSingle());
}

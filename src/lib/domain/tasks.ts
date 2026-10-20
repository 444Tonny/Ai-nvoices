import type { Task, TaskRow, TaskStatus } from "@/lib/types";
import { must, maybe, type DB } from "./core";
import type { TaskInput, TaskPatch } from "./schemas";

const SELECT = "*, project:projects(id, name, color, client:clients(id, name))";

interface RawTask extends Task {
  project: { id: string; name: string; color: string; client: { id: string; name: string } | null } | null;
}

export interface TaskFilter {
  projectId?: string;
  clientId?: string;
  ids?: string[];
  statuses?: TaskStatus[];
  search?: string;
}

/** Tâches enrichies : projet (couleur), client, temps total, temps facturé / à facturer. */
export async function listTaskRows(db: DB, filter: TaskFilter = {}): Promise<TaskRow[]> {
  let q = db.from("tasks").select(SELECT).order("position").order("created_at");
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.ids) q = q.in("id", filter.ids.length ? filter.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (filter.statuses?.length) q = q.in("status", filter.statuses);
  if (filter.search?.trim()) q = q.ilike("name", `%${filter.search.trim().replace(/[%_]/g, "")}%`);
  if (filter.clientId) {
    const projects = must(await db.from("projects").select("id").eq("client_id", filter.clientId)) as { id: string }[];
    if (projects.length === 0) return [];
    q = q.in("project_id", projects.map((p) => p.id));
  }

  const tasks = must(await q) as RawTask[];
  if (tasks.length === 0) return [];
  const ids = tasks.map((t) => t.id);

  const [totals, unbilled, billed] = await Promise.all([
    db.from("task_totals").select("task_id, total_seconds, last_entry_at, is_running").in("task_id", ids),
    db.from("unbilled_entries").select("task_id, seconds").in("task_id", ids),
    db.from("time_entries").select("task_id, start_time, end_time").in("task_id", ids).not("invoice_item_id", "is", null),
  ]);
  const totalsById = new Map(
    (must(totals) as { task_id: string; total_seconds: number; last_entry_at: string | null; is_running: boolean | null }[]).map((r) => [r.task_id, r]),
  );
  const sum = (rows: { task_id: string; seconds: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.task_id, (m.get(r.task_id) ?? 0) + Number(r.seconds));
    return m;
  };
  const unbilledById = sum(must(unbilled) as { task_id: string; seconds: number }[]);
  const billedById = sum(
    (must(billed) as { task_id: string; start_time: string; end_time: string | null }[]).map((e) => ({
      task_id: e.task_id,
      seconds: e.end_time ? (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000 : 0,
    })),
  );

  return tasks.map(({ project, ...t }) => {
    const tot = totalsById.get(t.id);
    return {
      ...t,
      position: Number(t.position),
      project: project ? { id: project.id, name: project.name, color: project.color } : null,
      client: project?.client ? { id: project.client.id, name: project.client.name } : null,
      total_seconds: Number(tot?.total_seconds ?? 0),
      unbilled_seconds: unbilledById.get(t.id) ?? 0,
      billed_seconds: billedById.get(t.id) ?? 0,
      last_entry_at: tot?.last_entry_at ?? null,
      is_running: Boolean(tot?.is_running),
    };
  });
}

export async function getTaskRow(db: DB, id: string): Promise<TaskRow | null> {
  const rows = await listTaskRows(db, { ids: [id] });
  return rows[0] ?? null;
}

export async function getTask(db: DB, id: string): Promise<Task | null> {
  return maybe(await db.from("tasks").select("*").eq("id", id).maybeSingle());
}

export interface RecentTask {
  id: string;
  name: string;
  project_name: string | null;
  project_color: string | null;
  client_name: string | null;
}

/** Les N tâches non terminées les plus récemment utilisées (palette ⌘K). */
export async function listRecentTasks(db: DB, limit = 20): Promise<RecentTask[]> {
  const rows = await listTaskRows(db, { statuses: ["todo", "in_progress", "review"] });
  return rows
    .sort((a, b) => (b.last_entry_at ?? b.created_at).localeCompare(a.last_entry_at ?? a.created_at))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      name: t.name,
      project_name: t.project?.name ?? null,
      project_color: t.project?.color ?? null,
      client_name: t.client?.name ?? null,
    }));
}

/** Options légères pour les sélecteurs de tâche (tâches ouvertes d'abord). */
export async function listTaskOptions(db: DB): Promise<{ id: string; name: string; project_name: string | null; project_color: string | null }[]> {
  const rows = must(
    await db.from("tasks").select("id, name, status, project:projects(name, color)").order("name"),
  ) as unknown as { id: string; name: string; status: TaskStatus; project: { name: string; color: string } | null }[];
  return rows
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done"))
    .map((t) => ({ id: t.id, name: t.name, project_name: t.project?.name ?? null, project_color: t.project?.color ?? null }));
}

export async function createTask(db: DB, input: TaskInput): Promise<Task> {
  return must(await db.from("tasks").insert(input).select().single());
}

export async function updateTask(db: DB, id: string, patch: TaskPatch): Promise<Task> {
  return must(await db.from("tasks").update(patch).eq("id", id).select().single());
}

/** Déplace une tâche (glisser-déposer du tableau) : nouveau statut et position. */
export async function moveTask(db: DB, id: string, status: TaskStatus, position: number): Promise<void> {
  must(await db.from("tasks").update({ status, position }).eq("id", id));
}

export async function deleteTasks(db: DB, ids: string[]): Promise<void> {
  must(await db.from("tasks").delete().in("id", ids));
}

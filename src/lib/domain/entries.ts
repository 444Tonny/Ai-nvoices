import type { TimeEntry, TimeEntryWithTask } from "@/lib/types";
import { must, type DB } from "./core";
import type { ManualEntryInput } from "./schemas";

const SELECT = "*, task:tasks(id, name, project:projects(name, client:clients(name)))";

interface RawEntry extends TimeEntry {
  task: { id: string; name: string; project: { name: string; client: { name: string } | null } | null } | null;
}

function flatten(e: RawEntry): TimeEntryWithTask {
  return {
    ...e,
    task: e.task
      ? {
          id: e.task.id,
          name: e.task.name,
          project_name: e.task.project?.name ?? null,
          client_name: e.task.project?.client?.name ?? null,
        }
      : null,
  };
}

export async function listEntriesForTask(db: DB, taskId: string): Promise<TimeEntry[]> {
  return must(await db.from("time_entries").select("*").eq("task_id", taskId).order("start_time", { ascending: false }));
}

/** Entrées qui chevauchent l'intervalle [from, to[ (ISO). */
export async function listEntriesInRange(db: DB, from: string, to: string): Promise<TimeEntryWithTask[]> {
  const rows = must(
    await db
      .from("time_entries")
      .select(SELECT)
      .lt("start_time", to)
      .or(`end_time.gt.${from},end_time.is.null`)
      .order("start_time"),
  ) as RawEntry[];
  return rows.map(flatten);
}

export async function addManualEntry(db: DB, input: ManualEntryInput): Promise<TimeEntry> {
  return must(await db.from("time_entries").insert(input).select().single());
}

export async function deleteEntries(db: DB, ids: string[]): Promise<void> {
  must(await db.from("time_entries").delete().in("id", ids));
}

/** Bornes des entrées qui se terminent après `fromIso` (ou en cours) : sert au total du jour. */
export async function listEntryTimesSince(db: DB, fromIso: string): Promise<Pick<TimeEntry, "start_time" | "end_time">[]> {
  return must(
    await db.from("time_entries").select("start_time, end_time").or(`end_time.gt.${fromIso},end_time.is.null`),
  );
}

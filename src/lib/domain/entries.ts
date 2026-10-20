import type { InvoiceStatus, TimeEntry, TimeEntryWithTask } from "@/lib/types";
import { must, type DB } from "./core";
import type { EntryPatch, ManualEntryInput } from "./schemas";

const SELECT =
  "*, task:tasks(id, name, project:projects(name, color, client:clients(name))), invoice_item:invoice_items(invoice:invoices(id, number, status))";

interface RawEntry extends TimeEntry {
  task: { id: string; name: string; project: { name: string; color: string; client: { name: string } | null } | null } | null;
  invoice_item: { invoice: { id: string; number: string; status: InvoiceStatus } | null } | null;
}

function flatten({ task, invoice_item, ...e }: RawEntry): TimeEntryWithTask {
  return {
    ...e,
    task: task
      ? {
          id: task.id,
          name: task.name,
          project_name: task.project?.name ?? null,
          project_color: task.project?.color ?? null,
          client_name: task.project?.client?.name ?? null,
        }
      : null,
    invoice: invoice_item?.invoice ?? null,
  };
}

export async function listEntriesForTask(db: DB, taskId: string): Promise<TimeEntryWithTask[]> {
  const rows = must(await db.from("time_entries").select(SELECT).eq("task_id", taskId).order("start_time", { ascending: false })) as RawEntry[];
  return rows.map(flatten);
}

/** Entrées qui chevauchent l'intervalle [from, to[ (ISO), plus récentes d'abord. */
export async function listEntriesInRange(db: DB, from: string, to: string, opts: { taskIds?: string[] } = {}): Promise<TimeEntryWithTask[]> {
  let q = db
    .from("time_entries")
    .select(SELECT)
    .lt("start_time", to)
    .or(`end_time.gt.${from},end_time.is.null`)
    .order("start_time", { ascending: false });
  if (opts.taskIds) q = q.in("task_id", opts.taskIds);
  return (must(await q) as RawEntry[]).map(flatten);
}

export async function addManualEntry(db: DB, input: ManualEntryInput): Promise<TimeEntry> {
  return must(await db.from("time_entries").insert(input).select().single());
}

export async function updateEntry(db: DB, id: string, patch: EntryPatch): Promise<TimeEntry> {
  return must(await db.from("time_entries").update(patch).eq("id", id).select().single());
}

export async function deleteEntries(db: DB, ids: string[]): Promise<void> {
  must(await db.from("time_entries").delete().in("id", ids));
}

/** Bornes des entrées qui se terminent après `fromIso` (ou en cours) : sert au total du jour. */
export async function listEntryTimesSince(db: DB, fromIso: string): Promise<Pick<TimeEntry, "start_time" | "end_time">[]> {
  return must(await db.from("time_entries").select("start_time, end_time").or(`end_time.gt.${fromIso},end_time.is.null`));
}

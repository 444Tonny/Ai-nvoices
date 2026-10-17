import type {
  Client,
  Invoice,
  InvoiceItem,
  InvoiceItemWithProject,
  InvoiceRow,
  InvoiceStatus,
  InvoiceTemplate,
} from "@/lib/types";
import { round2 } from "@/lib/numbers";
import { DomainError, must, maybe, type DB } from "./core";
import type { InvoiceInput, InvoiceItemInput, Period } from "./schemas";

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

interface TotalsRow {
  invoice_id: string;
  subtotal: number | string;
  total: number | string;
  item_count: number;
}

/**
 * Recalcule les heures des lignes liées à une tâche, pour les factures « unpaid »
 * uniquement (les factures « sent » et « paid » sont figées).
 */
export async function syncInvoiceHours(db: DB, invoiceId?: string): Promise<number> {
  return Number(must(await db.rpc("sync_invoice_hours", { p_invoice_id: invoiceId ?? null })) ?? 0);
}

export async function listInvoices(db: DB, opts: { status?: InvoiceStatus; clientId?: string } = {}): Promise<InvoiceRow[]> {
  await syncInvoiceHours(db);
  let q = db
    .from("invoices")
    .select("*, client:clients(id, name)")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const invoices = must(await q) as (Invoice & { client: InvoiceRow["client"] })[];
  if (invoices.length === 0) return [];
  const totals = must(
    await db.from("invoice_totals").select("*").in("invoice_id", invoices.map((i) => i.id)),
  ) as TotalsRow[];
  const byId = new Map(totals.map((t) => [t.invoice_id, t]));
  return invoices.map((i) => {
    const t = byId.get(i.id);
    return { ...i, subtotal: Number(t?.subtotal ?? 0), total: Number(t?.total ?? 0), item_count: t?.item_count ?? 0 };
  });
}

export interface InvoiceDetail {
  invoice: Invoice;
  client: Client | null;
  template: InvoiceTemplate | null;
  items: InvoiceItemWithProject[];
  subtotal: number;
  total: number;
}

interface RawItem extends InvoiceItem {
  task: { id: string; name: string; project: { id: string; name: string } | null } | null;
}

export async function listInvoiceItems(db: DB, invoiceId: string): Promise<InvoiceItemWithProject[]> {
  const rows = must(
    await db
      .from("invoice_items")
      .select("*, task:tasks(id, name, project:projects(id, name))")
      .eq("invoice_id", invoiceId)
      .order("position")
      .order("created_at"),
  ) as RawItem[];
  return rows.map(({ task, ...item }) => ({
    ...item,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    discount: Number(item.discount),
    project_id: task?.project?.id ?? null,
    project_name: task?.project?.name ?? null,
  }));
}

/** Détail complet d'une facture. Synchronise les heures si elle est « unpaid ». */
export async function getInvoiceDetail(db: DB, id: string): Promise<InvoiceDetail | null> {
  const invoice = maybe(await db.from("invoices").select("*").eq("id", id).maybeSingle()) as Invoice | null;
  if (!invoice) return null;
  if (invoice.status === "unpaid") await syncInvoiceHours(db, id);

  const [client, template, items] = await Promise.all([
    invoice.client_id
      ? db.from("clients").select("*").eq("id", invoice.client_id).maybeSingle().then(maybe)
      : Promise.resolve(null),
    invoice.template_id
      ? db.from("invoice_templates").select("*").eq("id", invoice.template_id).maybeSingle().then(maybe)
      : Promise.resolve(null),
    listInvoiceItems(db, id),
  ]);

  const subtotal = round2(items.reduce((s, i) => s + round2(i.quantity * i.unit_price), 0));
  const total = round2(items.reduce((s, i) => s + round2(i.quantity * i.unit_price * (1 - i.discount / 100)), 0));
  return {
    invoice,
    client: client as Client | null,
    template: template as InvoiceTemplate | null,
    items,
    subtotal,
    total,
  };
}

/** Prochain numéro libre au format FAC-AAAA-NNN. */
export async function nextInvoiceNumber(db: DB, date = new Date()): Promise<string> {
  const prefix = `FAC-${date.getFullYear()}-`;
  const rows = must(await db.from("invoices").select("number").like("number", `${prefix}%`)) as { number: string }[];
  const max = rows.reduce((m, r) => {
    const n = Number.parseInt(r.number.slice(prefix.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** IDs des tâches présentes dans au moins une facture (optionnellement hors d'une facture). */
export async function listInvoicedTaskIds(db: DB, excludeInvoiceId?: string): Promise<Set<string>> {
  let q = db.from("invoice_items").select("task_id, invoice_id").not("task_id", "is", null);
  if (excludeInvoiceId) q = q.neq("invoice_id", excludeInvoiceId);
  const rows = must(await q) as { task_id: string }[];
  return new Set(rows.map((r) => r.task_id));
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export async function createInvoice(db: DB, input: InvoiceInput): Promise<Invoice> {
  return must(await db.from("invoices").insert({ ...input, status: "unpaid" }).select().single());
}

export async function updateInvoice(db: DB, id: string, input: InvoiceInput): Promise<Invoice> {
  return must(await db.from("invoices").update(input).eq("id", id).select().single());
}

export async function setInvoiceStatus(db: DB, ids: string[], status: InvoiceStatus): Promise<void> {
  // Synchronise une dernière fois avant de figer une facture.
  if (status !== "unpaid") for (const id of ids) await syncInvoiceHours(db, id);
  must(await db.from("invoices").update({ status }).in("id", ids));
}

export async function deleteInvoices(db: DB, ids: string[]): Promise<void> {
  must(await db.from("invoices").delete().in("id", ids));
}

export async function addInvoiceItems(db: DB, invoiceId: string, items: InvoiceItemInput[]): Promise<void> {
  if (items.length === 0) return;
  const last = maybe(
    await db.from("invoice_items").select("position").eq("invoice_id", invoiceId).order("position", { ascending: false }).limit(1).maybeSingle(),
  ) as { position: number } | null;
  const start = (last?.position ?? -1) + 1;
  must(
    await db.from("invoice_items").insert(
      items.map((item, i) => ({ ...item, invoice_id: invoiceId, position: start + i })),
    ),
  );
}

export async function updateInvoiceItem(db: DB, id: string, input: InvoiceItemInput): Promise<void> {
  must(await db.from("invoice_items").update(input).eq("id", id));
}

export async function deleteInvoiceItems(db: DB, ids: string[]): Promise<void> {
  must(await db.from("invoice_items").delete().in("id", ids));
}

// ---------------------------------------------------------------------------
// Génération depuis une période
// ---------------------------------------------------------------------------

export interface DraftLine {
  task_id: string;
  task_name: string;
  project_name: string | null;
  hours: number;
  unit_price: number;
  already_invoiced: boolean;
}

export interface PeriodDraft {
  client: Client;
  from: string;
  to: string;
  lines: DraftLine[];
}

export function periodStart(period: Period, now = new Date()): Date {
  const d = new Date(now);
  if (period === "1m") d.setMonth(d.getMonth() - 1);
  else d.setDate(d.getDate() - { "1w": 7, "2w": 14, "3w": 21 }[period]);
  return d;
}

/**
 * Brouillon de facture : tâches du client ayant du temps sur la période,
 * heures découpées aux bornes × taux horaire du client.
 */
export async function buildPeriodDraft(db: DB, clientId: string, period: Period): Promise<PeriodDraft> {
  const client = maybe(await db.from("clients").select("*").eq("id", clientId).maybeSingle()) as Client | null;
  if (!client) throw new DomainError("Client introuvable.");

  const now = new Date();
  const from = periodStart(period, now);
  const fromIso = from.toISOString();
  const toIso = now.toISOString();

  const projects = must(await db.from("projects").select("id, name").eq("client_id", clientId)) as { id: string; name: string }[];
  if (projects.length === 0) return { client, from: fromIso, to: toIso, lines: [] };
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const tasks = must(
    await db.from("tasks").select("id, name, project_id").in("project_id", projects.map((p) => p.id)),
  ) as { id: string; name: string; project_id: string }[];
  if (tasks.length === 0) return { client, from: fromIso, to: toIso, lines: [] };

  const entries = must(
    await db
      .from("time_entries")
      .select("task_id, start_time, end_time")
      .in("task_id", tasks.map((t) => t.id))
      .lt("start_time", toIso)
      .or(`end_time.gt.${fromIso},end_time.is.null`),
  ) as { task_id: string; start_time: string; end_time: string | null }[];

  const seconds = new Map<string, number>();
  for (const e of entries) {
    const s = Math.max(new Date(e.start_time).getTime(), from.getTime());
    const en = Math.min(e.end_time ? new Date(e.end_time).getTime() : now.getTime(), now.getTime());
    if (en > s) seconds.set(e.task_id, (seconds.get(e.task_id) ?? 0) + (en - s) / 1000);
  }

  const invoiced = await listInvoicedTaskIds(db);
  const lines = tasks
    .filter((t) => (seconds.get(t.id) ?? 0) > 0)
    .map((t) => ({
      task_id: t.id,
      task_name: t.name,
      project_name: projectName.get(t.project_id) ?? null,
      hours: round2((seconds.get(t.id) ?? 0) / 3600),
      unit_price: Number(client.hourly_rate),
      already_invoiced: invoiced.has(t.id),
    }))
    .filter((l) => l.hours > 0)
    .sort((a, b) => (a.project_name ?? "").localeCompare(b.project_name ?? "") || a.task_name.localeCompare(b.task_name));

  return { client, from: fromIso, to: toIso, lines };
}

/**
 * Crée une facture « unpaid » pour un client avec des lignes déjà calculées.
 * Le profil émetteur par défaut est le premier créé.
 */
export async function createInvoiceWithItems(
  db: DB,
  opts: { clientId: string | null; currency?: string; templateId?: string | null; items: InvoiceItemInput[] },
): Promise<Invoice> {
  let currency = opts.currency;
  if (!currency && opts.clientId) {
    const c = maybe(await db.from("clients").select("currency").eq("id", opts.clientId).maybeSingle()) as { currency: string } | null;
    currency = c?.currency;
  }
  let templateId = opts.templateId ?? null;
  if (!templateId) {
    const t = maybe(await db.from("invoice_templates").select("id").order("created_at").limit(1).maybeSingle()) as { id: string } | null;
    templateId = t?.id ?? null;
  }
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 30);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const invoice = await createInvoice(db, {
    number: await nextInvoiceNumber(db, today),
    client_id: opts.clientId,
    template_id: templateId,
    invoice_date: iso(today),
    issue_date: iso(today),
    due_date: iso(due),
    currency: (currency ?? "EUR") as InvoiceInput["currency"],
    notes: null,
    footer_text: null,
  });
  try {
    await addInvoiceItems(db, invoice.id, opts.items);
  } catch (e) {
    await deleteInvoices(db, [invoice.id]);
    throw e;
  }
  return invoice;
}

import type {
  Client,
  Invoice,
  InvoiceItem,
  InvoiceItemWithProject,
  InvoiceRow,
  InvoiceStatus,
  InvoiceTemplate,
} from "@/lib/types";
import { lineAmount, round2 } from "@/lib/numbers";
import { DomainError, must, maybe, type DB } from "./core";
import type { InvoiceInput, InvoiceItemInput } from "./schemas";

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

interface TotalsRow {
  invoice_id: string;
  subtotal: number | string;
  total: number | string;
  item_count: number;
}

export async function listInvoices(db: DB, opts: { status?: InvoiceStatus; clientId?: string } = {}): Promise<InvoiceRow[]> {
  let q = db
    .from("invoices")
    .select("*, client:clients(id, name)")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const invoices = must(await q) as (Invoice & { client: InvoiceRow["client"] })[];
  if (invoices.length === 0) return [];
  const totals = must(await db.from("invoice_totals").select("*").in("invoice_id", invoices.map((i) => i.id))) as TotalsRow[];
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
  task: { id: string; name: string; project: { id: string; name: string; color: string } | null } | null;
}

export async function listInvoiceItems(db: DB, invoiceId: string): Promise<InvoiceItemWithProject[]> {
  const rows = must(
    await db
      .from("invoice_items")
      .select("*, task:tasks(id, name, project:projects(id, name, color))")
      .eq("invoice_id", invoiceId)
      .order("position")
      .order("created_at"),
  ) as RawItem[];
  if (rows.length === 0) return [];
  const entries = must(
    await db.from("time_entries").select("invoice_item_id").in("invoice_item_id", rows.map((r) => r.id)),
  ) as { invoice_item_id: string }[];
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.invoice_item_id, (counts.get(e.invoice_item_id) ?? 0) + 1);

  return rows.map(({ task, ...item }) => ({
    ...item,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    discount: Number(item.discount),
    project_id: task?.project?.id ?? null,
    project_name: task?.project?.name ?? null,
    project_color: task?.project?.color ?? null,
    entry_count: counts.get(item.id) ?? 0,
  }));
}

export async function getInvoice(db: DB, id: string): Promise<Invoice | null> {
  return maybe(await db.from("invoices").select("*").eq("id", id).maybeSingle()) as Invoice | null;
}

/** Détail complet d'une facture : client, émetteur, lignes (avec projet) et totaux. */
export async function getInvoiceDetail(db: DB, id: string): Promise<InvoiceDetail | null> {
  const invoice = await getInvoice(db, id);
  if (!invoice) return null;

  const [client, template, items] = await Promise.all([
    invoice.client_id ? db.from("clients").select("*").eq("id", invoice.client_id).maybeSingle().then(maybe) : Promise.resolve(null),
    invoice.template_id
      ? db.from("invoice_templates").select("*").eq("id", invoice.template_id).maybeSingle().then(maybe)
      : Promise.resolve(null),
    listInvoiceItems(db, id),
  ]);

  const subtotal = round2(items.reduce((s, i) => s + round2(i.quantity * i.unit_price), 0));
  const total = round2(items.reduce((s, i) => s + lineAmount(i.quantity, i.unit_price, i.discount), 0));
  return { invoice, client: client as Client | null, template: template as InvoiceTemplate | null, items, subtotal, total };
}

export async function nextInvoiceNumber(db: DB): Promise<string> {
  return String(must(await db.rpc("next_invoice_number")));
}

export interface InvoiceOption {
  id: string;
  number: string;
  status: InvoiceStatus;
  client_id: string | null;
  client_name: string | null;
  currency: string;
}

/** Liste légère pour les sélecteurs (non payées uniquement par défaut : seules à pouvoir recevoir du temps). */
export async function listInvoiceOptions(db: DB, opts: { onlyUnpaid?: boolean } = { onlyUnpaid: true }): Promise<InvoiceOption[]> {
  let q = db.from("invoices").select("id, number, status, client_id, currency, client:clients(name)").order("created_at", { ascending: false });
  if (opts.onlyUnpaid) q = q.eq("status", "unpaid");
  const rows = must(await q) as unknown as (Omit<InvoiceOption, "client_name"> & { client: { name: string } | null })[];
  return rows.map(({ client, ...r }) => ({ ...r, client_name: client?.name ?? null }));
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export async function createInvoice(db: DB, input: InvoiceInput): Promise<Invoice> {
  const invoice = must(await db.from("invoices").insert({ ...input, status: "unpaid" }).select().single()) as Invoice;
  if (!invoice.footer_text) await applyTemplateFooter(db, invoice.id);
  return invoice;
}

/** Facture vide avec les valeurs par défaut (numéro, profil, devise du client, échéance J+30). */
export async function createDefaultInvoice(db: DB, clientId: string | null): Promise<string> {
  const id = String(must(await db.rpc("invoice_create", { p_client_id: clientId })));
  await applyTemplateFooter(db, id);
  return id;
}

/** Préremplit le pied de page d'une facture qui n'en a pas avec celui de son profil émetteur. */
export async function applyTemplateFooter(db: DB, invoiceId: string): Promise<void> {
  const inv = maybe(
    await db.from("invoices").select("footer_text, template:invoice_templates(default_footer_text)").eq("id", invoiceId).maybeSingle(),
  ) as unknown as { footer_text: string | null; template: { default_footer_text: string | null } | null } | null;
  const footer = inv?.template?.default_footer_text;
  if (inv && !inv.footer_text && footer) must(await db.from("invoices").update({ footer_text: footer }).eq("id", invoiceId));
}

export async function updateInvoice(db: DB, id: string, input: InvoiceInput): Promise<Invoice> {
  return must(await db.from("invoices").update(input).eq("id", id).select().single());
}

export async function setInvoiceStatus(db: DB, ids: string[], status: InvoiceStatus): Promise<void> {
  must(await db.from("invoices").update({ status }).in("id", ids));
}

export async function deleteInvoices(db: DB, ids: string[]): Promise<void> {
  must(await db.from("invoices").delete().in("id", ids));
}

/** Ajoute des lignes libres (forfait, frais…) à une facture. */
export async function addManualItems(db: DB, invoiceId: string, items: InvoiceItemInput[]): Promise<void> {
  if (items.length === 0) return;
  const last = maybe(
    await db.from("invoice_items").select("position").eq("invoice_id", invoiceId).order("position", { ascending: false }).limit(1).maybeSingle(),
  ) as { position: number } | null;
  const start = (last?.position ?? -1) + 1;
  must(
    await db
      .from("invoice_items")
      .insert(items.map((item, i) => ({ ...item, invoice_id: invoiceId, source: "manual", position: start + i }))),
  );
}

/** Met à jour une ligne. La quantité d'une ligne de temps suit ses entrées : elle n'est pas modifiable. */
export async function updateInvoiceItem(db: DB, id: string, input: InvoiceItemInput): Promise<void> {
  const item = maybe(await db.from("invoice_items").select("source").eq("id", id).maybeSingle()) as { source: string } | null;
  if (!item) throw new DomainError("Ligne introuvable.");
  const patch: Partial<InvoiceItemInput> = { ...input };
  if (item.source === "time") delete patch.quantity;
  must(await db.from("invoice_items").update(patch).eq("id", id));
}

/** Supprime des lignes : le temps qu'elles facturaient redevient « à facturer ». */
export async function deleteInvoiceItems(db: DB, ids: string[]): Promise<void> {
  must(await db.from("invoice_items").delete().in("id", ids));
}

// ---------------------------------------------------------------------------
// Facturation du temps (façon Clockify)
// ---------------------------------------------------------------------------

/** Rattache le temps non facturé à une facture non payée. Retourne le nombre d'entrées ajoutées. */
export async function addUnbilledToInvoice(
  db: DB,
  invoiceId: string,
  opts: { taskIds?: string[]; from?: string | null; to?: string | null } = {},
): Promise<number> {
  return Number(
    must(
      await db.rpc("invoice_add_unbilled", {
        p_invoice_id: invoiceId,
        p_task_ids: opts.taskIds?.length ? opts.taskIds : null,
        p_from: opts.from ?? null,
        p_to: opts.to ?? null,
      }),
    ) ?? 0,
  );
}

/** Crée une facture pour un client à partir de son temps non facturé (période facultative). */
export async function createInvoiceFromUnbilled(
  db: DB,
  clientId: string,
  opts: { from?: string | null; to?: string | null } = {},
): Promise<{ invoiceId: string; entries: number }> {
  const invoiceId = await createDefaultInvoice(db, clientId);
  const entries = await addUnbilledToInvoice(db, invoiceId, opts);
  if (entries === 0) {
    await deleteInvoices(db, [invoiceId]);
    throw new DomainError("Aucun temps à facturer pour ce client sur cette période.");
  }
  return { invoiceId, entries };
}

/**
 * Ajoute des tâches à une facture (leur temps non facturé).
 * Sans facture cible : crée une facture pour le client commun des tâches.
 */
export async function addTasksToInvoice(
  db: DB,
  taskIds: string[],
  invoiceId: string | null,
): Promise<{ invoiceId: string; entries: number }> {
  let target = invoiceId;
  if (!target) {
    const rows = must(await db.from("tasks").select("id, project:projects(client_id)").in("id", taskIds)) as unknown as {
      project: { client_id: string | null } | null;
    }[];
    const clients = new Set(rows.map((r) => r.project?.client_id ?? null));
    target = await createDefaultInvoice(db, clients.size === 1 ? [...clients][0] : null);
  }
  const entries = await addUnbilledToInvoice(db, target, { taskIds });
  if (entries === 0 && !invoiceId) {
    await deleteInvoices(db, [target]);
    throw new DomainError("Ces tâches n'ont pas de temps à facturer.");
  }
  return { invoiceId: target, entries };
}

export interface UnbilledTask {
  task_id: string;
  task_name: string;
  seconds: number;
  amount: number;
  entries: number;
}

export interface UnbilledProject {
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  seconds: number;
  amount: number;
  tasks: UnbilledTask[];
}

export interface UnbilledClient {
  client_id: string | null;
  client_name: string | null;
  currency: string;
  seconds: number;
  amount: number;
  first_entry: string;
  last_entry: string;
  projects: UnbilledProject[];
}

interface UnbilledRow {
  task_id: string;
  task_name: string;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  client_id: string | null;
  client_name: string | null;
  currency: string;
  rate: number;
  start_time: string;
  seconds: number;
}

/** Temps à facturer regroupé par client puis projet puis tâche (période facultative, bornes ISO). */
export async function listUnbilled(db: DB, opts: { clientId?: string; from?: string | null; to?: string | null } = {}): Promise<UnbilledClient[]> {
  let q = db.from("unbilled_entries").select("*").order("start_time");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.from) q = q.gte("start_time", opts.from);
  if (opts.to) q = q.lt("start_time", opts.to);
  const rows = must(await q) as UnbilledRow[];

  const clients = new Map<string, UnbilledClient>();
  for (const r of rows) {
    const secs = Number(r.seconds);
    const amount = (secs / 3600) * Number(r.rate);
    const ck = r.client_id ?? "none";
    let c = clients.get(ck);
    if (!c) {
      c = { client_id: r.client_id, client_name: r.client_name, currency: r.currency, seconds: 0, amount: 0, first_entry: r.start_time, last_entry: r.start_time, projects: [] };
      clients.set(ck, c);
    }
    c.seconds += secs;
    c.amount += amount;
    if (r.start_time < c.first_entry) c.first_entry = r.start_time;
    if (r.start_time > c.last_entry) c.last_entry = r.start_time;

    let p = c.projects.find((x) => x.project_id === r.project_id);
    if (!p) {
      p = { project_id: r.project_id, project_name: r.project_name, project_color: r.project_color, seconds: 0, amount: 0, tasks: [] };
      c.projects.push(p);
    }
    p.seconds += secs;
    p.amount += amount;

    let t = p.tasks.find((x) => x.task_id === r.task_id);
    if (!t) {
      t = { task_id: r.task_id, task_name: r.task_name, seconds: 0, amount: 0, entries: 0 };
      p.tasks.push(t);
    }
    t.seconds += secs;
    t.amount += amount;
    t.entries += 1;
  }

  return [...clients.values()]
    .map((c) => ({
      ...c,
      amount: round2(c.amount),
      projects: c.projects.map((p) => ({ ...p, amount: round2(p.amount), tasks: p.tasks.map((t) => ({ ...t, amount: round2(t.amount) })) })),
    }))
    .sort((a, b) => b.amount - a.amount);
}

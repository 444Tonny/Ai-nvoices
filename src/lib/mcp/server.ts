import "server-only";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DomainError, must, type DB } from "@/lib/domain/core";
import { clientInput, entryPatch, manualEntryInput, projectInput, taskInput, taskPatch, firstIssue } from "@/lib/domain/schemas";
import { createClient as createClientRow, listClients, updateClient } from "@/lib/domain/clients";
import { createProject, listProjectSummaries, updateProject } from "@/lib/domain/projects";
import { createTask, deleteTasks, getTaskRow, listTaskRows, updateTask } from "@/lib/domain/tasks";
import { addManualEntry, deleteEntries, listEntriesForTask, listEntriesInRange, updateEntry } from "@/lib/domain/entries";
import {
  addManualItems,
  addTasksToInvoice,
  addUnbilledToInvoice,
  createDefaultInvoice,
  createInvoiceFromUnbilled,
  getInvoiceDetail,
  listInvoices,
  listUnbilled,
  setInvoiceStatus,
} from "@/lib/domain/invoices";
import { getTimerState, pauseTimer, resumeTimer, startTimer, stopTimer } from "@/lib/domain/timer";
import { dateToZonedIso } from "@/lib/tz-utils";
import { CURRENCIES } from "@/lib/currency";

const INSTRUCTIONS = `AI-nvoices est le time tracker et l'outil de facturation de l'utilisateur (freelance).
Modèle : client → projets → tâches → entrées de temps → lignes de facture.
- Une tâche a un statut (todo, in_progress, review, done), une priorité, une échéance et appartient à un projet (facultatif).
- Le temps est saisi en entrées (début/fin) sur une tâche, via le timer ou manuellement.
- Facturation : chaque entrée facturable non facturée est « à facturer ». Ajouter une tâche à une facture y rattache tout son temps non facturé ; la quantité (heures) de la ligne suit automatiquement ses entrées. Une entrée n'est jamais facturée deux fois. Le taux = taux du projet, sinon taux du client.
- Les factures « sent » et « paid » sont verrouillées.
Bonnes pratiques : utiliser list_projects / list_tasks pour retrouver les identifiants avant d'écrire ; préférer project_name/client_name quand l'utilisateur donne un nom ; les dates sont en ISO 8601, les durées en heures décimales dans les réponses.`;

const id = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD");
const isoDateTime = z.string().describe("Date-heure ISO 8601 avec fuseau, ex. 2026-10-20T09:00:00-04:00");
const status = z.enum(["todo", "in_progress", "review", "done"]);
const priority = z.enum(["urgent", "high", "normal", "low"]);
const timezone = z.string().optional().describe("Fuseau IANA pour interpréter les dates seules (défaut : UTC), ex. Europe/Paris");

const hours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown): CallToolResult {
  const message =
    e instanceof z.ZodError ? firstIssue(e) : e instanceof DomainError || e instanceof Error ? e.message : "Erreur inattendue";
  return { content: [{ type: "text", text: `Erreur : ${message}` }], isError: true };
}

async function safe(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

/** Résout un projet par identifiant ou par nom (insensible à la casse). */
async function resolveProjectId(db: DB, projectId?: string | null, projectName?: string | null): Promise<string | null> {
  if (projectId) return projectId;
  if (!projectName) return null;
  const rows = must(await db.from("projects").select("id, name").ilike("name", projectName.trim())) as { id: string; name: string }[];
  if (rows.length === 1) return rows[0].id;
  const partial = must(await db.from("projects").select("id, name").ilike("name", `%${projectName.trim()}%`)) as { id: string; name: string }[];
  if (partial.length === 1) return partial[0].id;
  if (partial.length === 0) throw new DomainError(`Aucun projet ne correspond à « ${projectName} ».`);
  throw new DomainError(`Plusieurs projets correspondent à « ${projectName} » : ${partial.map((p) => p.name).join(", ")}. Précisez project_id.`);
}

async function resolveClientId(db: DB, clientId?: string | null, clientName?: string | null): Promise<string | null> {
  if (clientId) return clientId;
  if (!clientName) return null;
  const rows = must(await db.from("clients").select("id, name").ilike("name", `%${clientName.trim()}%`)) as { id: string; name: string }[];
  if (rows.length === 1) return rows[0].id;
  if (rows.length === 0) throw new DomainError(`Aucun client ne correspond à « ${clientName} ».`);
  const exact = rows.find((r) => r.name.toLowerCase() === clientName.trim().toLowerCase());
  if (exact) return exact.id;
  throw new DomainError(`Plusieurs clients correspondent à « ${clientName} » : ${rows.map((r) => r.name).join(", ")}. Précisez client_id.`);
}

const taskView = (t: Awaited<ReturnType<typeof listTaskRows>>[number]) => ({
  id: t.id,
  name: t.name,
  status: t.status,
  priority: t.priority,
  due_date: t.due_date,
  estimate_hours: t.estimate_minutes === null ? null : hours(t.estimate_minutes * 60),
  project: t.project ? { id: t.project.id, name: t.project.name } : null,
  client: t.client,
  total_hours: hours(t.total_seconds),
  unbilled_hours: hours(t.unbilled_seconds),
  billed_hours: hours(t.billed_seconds),
  is_running: t.is_running,
});

/** Construit le serveur MCP pour un utilisateur authentifié (client Supabase porteur de son jeton). */
export function buildMcpServer(db: DB, user: { email: string | null }): McpServer {
  const server = new McpServer({ name: "ai-nvoices", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const read = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

  // ------------------------------------------------------------------ Lecture
  server.registerTool(
    "get_overview",
    {
      title: "Vue d'ensemble",
      description: "Compte connecté, état du timer, tâches en cours, temps à facturer par client et factures en attente. À appeler en premier pour se repérer.",
      inputSchema: {},
      annotations: read,
    },
    () =>
      safe(async () => {
        const [timer, active, unbilled, invoices] = await Promise.all([
          getTimerState(db),
          listTaskRows(db, { statuses: ["in_progress", "review"] }),
          listUnbilled(db),
          listInvoices(db),
        ]);
        return {
          user: user.email,
          timer: { status: timer.status, task: timer.task, started_at: timer.entry_start },
          active_tasks: active.map(taskView),
          unbilled: unbilled.map((c) => ({ client_id: c.client_id, client: c.client_name, hours: hours(c.seconds), amount: c.amount, currency: c.currency })),
          unpaid_invoices: invoices
            .filter((i) => i.status !== "paid")
            .map((i) => ({ id: i.id, number: i.number, client: i.client?.name ?? null, status: i.status, total: i.total, currency: i.currency, due_date: i.due_date })),
        };
      }),
  );

  server.registerTool(
    "list_clients",
    { title: "Lister les clients", description: "Clients avec taux horaire et devise.", inputSchema: {}, annotations: read },
    () => safe(async () => (await listClients(db)).map((c) => ({ id: c.id, name: c.name, hourly_rate: Number(c.hourly_rate), currency: c.currency, email: c.email }))),
  );

  server.registerTool(
    "list_projects",
    {
      title: "Lister les projets",
      description: "Projets avec client, taux effectif, temps total, montant à facturer et nombre de tâches par statut.",
      inputSchema: {
        client_id: id.optional(),
        include_archived: z.boolean().optional().describe("Inclure les projets archivés (défaut : non)"),
      },
      annotations: read,
    },
    ({ client_id, include_archived }) =>
      safe(async () =>
        (await listProjectSummaries(db, { clientId: client_id, includeArchived: include_archived })).map((p) => ({
          id: p.id,
          name: p.name,
          client: p.client ? { id: p.client.id, name: p.client.name } : null,
          rate: p.rate,
          currency: p.currency,
          billable: p.billable,
          archived: p.archived,
          total_hours: hours(p.total_seconds),
          unbilled_hours: hours(p.unbilled_seconds),
          unbilled_amount: p.unbilled_amount,
          tasks: p.task_counts,
        })),
      ),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "Lister les tâches",
      description: "Tâches avec statut, priorité, échéance, projet, temps total et temps à facturer. Filtrable.",
      inputSchema: {
        project_id: id.optional(),
        project_name: z.string().optional().describe("Nom (ou partie du nom) du projet"),
        client_id: id.optional(),
        status: z.array(status).optional().describe("Statuts à inclure (défaut : tous)"),
        search: z.string().optional().describe("Texte recherché dans le nom de la tâche"),
      },
      annotations: read,
    },
    ({ project_id, project_name, client_id, status: statuses, search }) =>
      safe(async () => {
        const pid = await resolveProjectId(db, project_id, project_name);
        return (await listTaskRows(db, { projectId: pid ?? undefined, clientId: client_id, statuses, search })).map(taskView);
      }),
  );

  server.registerTool(
    "get_task",
    { title: "Détail d'une tâche", description: "Tâche avec description et toutes ses entrées de temps (facturées ou non).", inputSchema: { task_id: id }, annotations: read },
    ({ task_id }) =>
      safe(async () => {
        const task = await getTaskRow(db, task_id);
        if (!task) throw new DomainError("Tâche introuvable.");
        const entries = await listEntriesForTask(db, task_id);
        return {
          ...taskView(task),
          description: task.description,
          entries: entries.map((e) => ({
            id: e.id,
            start_time: e.start_time,
            end_time: e.end_time,
            hours: e.end_time ? hours((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000) : null,
            description: e.description,
            billable: e.billable,
            invoice: e.invoice,
          })),
        };
      }),
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "Lister les entrées de temps",
      description: "Entrées de temps sur une période (bornes incluses), avec tâche, projet et facture éventuelle.",
      inputSchema: { from: isoDate.describe("Premier jour, YYYY-MM-DD"), to: isoDate.describe("Dernier jour inclus, YYYY-MM-DD"), timezone },
      annotations: read,
    },
    ({ from, to, timezone: tz }) =>
      safe(async () => {
        const zone = tz ?? "UTC";
        const entries = await listEntriesInRange(db, dateToZonedIso(from, zone), dateToZonedIso(to, zone, 1));
        return entries.map((e) => ({
          id: e.id,
          task: e.task ? { id: e.task.id, name: e.task.name, project: e.task.project_name } : null,
          start_time: e.start_time,
          end_time: e.end_time,
          hours: e.end_time ? hours((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000) : null,
          description: e.description,
          billable: e.billable,
          invoice: e.invoice,
        }));
      }),
  );

  server.registerTool(
    "list_unbilled",
    {
      title: "Temps à facturer",
      description: "Temps facturable pas encore facturé, regroupé par client, projet et tâche, avec montants.",
      inputSchema: { client_id: id.optional(), from: isoDate.optional(), to: isoDate.optional().describe("Dernier jour inclus"), timezone },
      annotations: read,
    },
    ({ client_id, from, to, timezone: tz }) =>
      safe(async () => {
        const zone = tz ?? "UTC";
        const rows = await listUnbilled(db, { clientId: client_id, from: from ? dateToZonedIso(from, zone) : null, to: to ? dateToZonedIso(to, zone, 1) : null });
        return rows.map((c) => ({
          client_id: c.client_id,
          client: c.client_name,
          currency: c.currency,
          hours: hours(c.seconds),
          amount: c.amount,
          projects: c.projects.map((p) => ({
            project_id: p.project_id,
            project: p.project_name,
            hours: hours(p.seconds),
            amount: p.amount,
            tasks: p.tasks.map((t) => ({ task_id: t.task_id, task: t.task_name, hours: hours(t.seconds), amount: t.amount, entries: t.entries })),
          })),
        }));
      }),
  );

  server.registerTool(
    "list_invoices",
    {
      title: "Lister les factures",
      description: "Factures avec client, statut, dates et total.",
      inputSchema: { status: z.enum(["unpaid", "sent", "paid"]).optional(), client_id: id.optional() },
      annotations: read,
    },
    ({ status: s, client_id }) =>
      safe(async () =>
        (await listInvoices(db, { status: s, clientId: client_id })).map((i) => ({
          id: i.id,
          number: i.number,
          client: i.client?.name ?? null,
          status: i.status,
          invoice_date: i.invoice_date,
          due_date: i.due_date,
          total: i.total,
          currency: i.currency,
          lines: i.item_count,
        })),
      ),
  );

  server.registerTool(
    "get_invoice",
    { title: "Détail d'une facture", description: "En-tête, lignes (heures, prix, remise, projet) et totaux d'une facture.", inputSchema: { invoice_id: id }, annotations: read },
    ({ invoice_id }) =>
      safe(async () => {
        const d = await getInvoiceDetail(db, invoice_id);
        if (!d) throw new DomainError("Facture introuvable.");
        return {
          invoice: d.invoice,
          client: d.client ? { id: d.client.id, name: d.client.name } : null,
          lines: d.items.map((i) => ({
            id: i.id,
            description: i.description,
            source: i.source,
            hours_or_quantity: i.quantity,
            unit_price: i.unit_price,
            discount_percent: i.discount,
            project: i.project_name,
            task_id: i.task_id,
            time_entries: i.entry_count,
          })),
          subtotal: d.subtotal,
          total: d.total,
          pdf_path: `/api/invoices/${d.invoice.id}/pdf`,
        };
      }),
  );

  // ------------------------------------------------------- Clients et projets
  server.registerTool(
    "create_client",
    {
      title: "Créer un client",
      description: "Crée un client avec son taux horaire par défaut.",
      inputSchema: {
        name: z.string().min(1),
        hourly_rate: z.number().min(0),
        currency: z.enum(CURRENCIES).optional().describe("Défaut : EUR"),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
      },
      annotations: write,
    },
    (args) =>
      safe(async () => {
        const c = await createClientRow(db, clientInput.parse(args));
        return { id: c.id, name: c.name };
      }),
  );

  server.registerTool(
    "update_client",
    {
      title: "Modifier un client",
      description: "Met à jour les champs fournis d'un client.",
      inputSchema: {
        client_id: id,
        name: z.string().optional(),
        hourly_rate: z.number().min(0).optional(),
        currency: z.enum(CURRENCIES).optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
      },
      annotations: write,
    },
    ({ client_id, ...patch }) =>
      safe(async () => {
        const current = must(await db.from("clients").select("*").eq("id", client_id).maybeSingle()) as Record<string, unknown> | null;
        if (!current) throw new DomainError("Client introuvable.");
        const c = await updateClient(db, client_id, clientInput.parse({ ...current, ...patch }));
        return { id: c.id, name: c.name };
      }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Créer un projet",
      description: "Crée un projet, rattaché à un client (par id ou par nom). Le taux horaire du projet est facultatif (sinon celui du client).",
      inputSchema: {
        name: z.string().min(1),
        client_id: id.optional(),
        client_name: z.string().optional(),
        description: z.string().optional(),
        hourly_rate: z.number().min(0).optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        billable: z.boolean().optional(),
      },
      annotations: write,
    },
    ({ client_id, client_name, ...rest }) =>
      safe(async () => {
        const cid = await resolveClientId(db, client_id, client_name);
        const p = await createProject(db, projectInput.parse({ ...rest, client_id: cid }));
        return { id: p.id, name: p.name, client: p.client?.name ?? null };
      }),
  );

  server.registerTool(
    "update_project",
    {
      title: "Modifier un projet",
      description: "Met à jour les champs fournis d'un projet (nom, client, taux, facturable, archivé…).",
      inputSchema: {
        project_id: id,
        name: z.string().optional(),
        client_id: id.nullable().optional(),
        description: z.string().nullable().optional(),
        hourly_rate: z.number().min(0).nullable().optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        billable: z.boolean().optional(),
        archived: z.boolean().optional(),
      },
      annotations: write,
    },
    ({ project_id, ...patch }) =>
      safe(async () => {
        const current = must(await db.from("projects").select("*").eq("id", project_id).maybeSingle()) as Record<string, unknown> | null;
        if (!current) throw new DomainError("Projet introuvable.");
        const p = await updateProject(db, project_id, projectInput.parse({ ...current, ...patch }));
        return { id: p.id, name: p.name };
      }),
  );

  // -------------------------------------------------------------------- Tâches
  server.registerTool(
    "create_task",
    {
      title: "Créer une tâche",
      description: "Crée une tâche dans un projet (par id ou par nom).",
      inputSchema: {
        name: z.string().min(1),
        project_id: id.optional(),
        project_name: z.string().optional(),
        description: z.string().optional(),
        status: status.optional().describe("Défaut : todo"),
        priority: priority.optional(),
        due_date: isoDate.optional(),
        estimate_hours: z.number().min(0).optional(),
      },
      annotations: write,
    },
    ({ project_id, project_name, estimate_hours, ...rest }) =>
      safe(async () => {
        const pid = await resolveProjectId(db, project_id, project_name);
        const t = await createTask(
          db,
          taskInput.parse({ ...rest, project_id: pid, estimate_minutes: estimate_hours === undefined ? null : Math.round(estimate_hours * 60) }),
        );
        return { id: t.id, name: t.name, status: t.status };
      }),
  );

  server.registerTool(
    "update_task",
    {
      title: "Modifier une tâche",
      description: "Met à jour les champs fournis : nom, description, statut, priorité, échéance, estimation, projet.",
      inputSchema: {
        task_id: id,
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        status: status.optional(),
        priority: priority.nullable().optional(),
        due_date: isoDate.nullable().optional(),
        estimate_hours: z.number().min(0).nullable().optional(),
        project_id: id.nullable().optional(),
        project_name: z.string().optional(),
      },
      annotations: write,
    },
    ({ task_id, estimate_hours, project_id, project_name, ...rest }) =>
      safe(async () => {
        const patch: Record<string, unknown> = { ...rest };
        if (estimate_hours !== undefined) patch.estimate_minutes = estimate_hours === null ? null : Math.round(estimate_hours * 60);
        if (project_name) patch.project_id = await resolveProjectId(db, null, project_name);
        else if (project_id !== undefined) patch.project_id = project_id;
        const t = await updateTask(db, task_id, taskPatch.parse(patch));
        return { id: t.id, name: t.name, status: t.status };
      }),
  );

  server.registerTool(
    "delete_task",
    {
      title: "Supprimer une tâche",
      description: "Supprime une tâche et son historique de temps (impossible si son temps est sur une facture envoyée ou payée).",
      inputSchema: { task_id: id },
      annotations: destructive,
    },
    ({ task_id }) => safe(async () => (await deleteTasks(db, [task_id]), { deleted: task_id })),
  );

  // ------------------------------------------------------------- Temps / timer
  server.registerTool(
    "timer_status",
    { title: "État du timer", description: "Timer en cours, en pause ou arrêté, avec la tâche et l'heure de début.", inputSchema: {}, annotations: read },
    () => safe(async () => getTimerState(db)),
  );

  server.registerTool(
    "start_timer",
    {
      title: "Démarrer le timer",
      description: "Démarre le timer sur une tâche (arrête le timer en cours s'il y en a un). Une tâche « todo » passe « in_progress ».",
      inputSchema: { task_id: id },
      annotations: write,
    },
    ({ task_id }) => safe(async () => (await startTimer(db, task_id), getTimerState(db))),
  );

  server.registerTool("pause_timer", { title: "Mettre en pause", description: "Met le timer en pause.", inputSchema: {}, annotations: write }, () =>
    safe(async () => (await pauseTimer(db), getTimerState(db))),
  );
  server.registerTool("resume_timer", { title: "Reprendre", description: "Reprend le timer en pause.", inputSchema: {}, annotations: write }, () =>
    safe(async () => (await resumeTimer(db), getTimerState(db))),
  );
  server.registerTool("stop_timer", { title: "Arrêter le timer", description: "Arrête le timer et enregistre l'entrée.", inputSchema: {}, annotations: write }, () =>
    safe(async () => (await stopTimer(db), getTimerState(db))),
  );

  server.registerTool(
    "add_time_entry",
    {
      title: "Saisir du temps",
      description: "Ajoute une entrée de temps terminée sur une tâche. Fournir end_time ou duration_minutes.",
      inputSchema: {
        task_id: id,
        start_time: isoDateTime,
        end_time: isoDateTime.optional(),
        duration_minutes: z.number().positive().optional(),
        description: z.string().optional(),
        billable: z.boolean().optional().describe("Défaut : true"),
      },
      annotations: write,
    },
    ({ task_id, start_time, end_time, duration_minutes, description, billable }) =>
      safe(async () => {
        const start = new Date(start_time);
        if (Number.isNaN(start.getTime())) throw new DomainError("start_time invalide.");
        const end = end_time ? new Date(end_time) : duration_minutes ? new Date(start.getTime() + duration_minutes * 60_000) : null;
        if (!end) throw new DomainError("Fournissez end_time ou duration_minutes.");
        const e = await addManualEntry(
          db,
          manualEntryInput.parse({ task_id, start_time: start.toISOString(), end_time: end.toISOString(), description: description ?? null, billable: billable ?? true }),
        );
        return { id: e.id, task_id: e.task_id, start_time: e.start_time, end_time: e.end_time, hours: hours((end.getTime() - start.getTime()) / 1000) };
      }),
  );

  server.registerTool(
    "update_time_entry",
    {
      title: "Modifier une entrée de temps",
      description: "Modifie une entrée (horaires, tâche, description, facturable). Refusé si elle est sur une facture envoyée ou payée.",
      inputSchema: {
        entry_id: id,
        task_id: id.optional(),
        start_time: isoDateTime.optional(),
        end_time: isoDateTime.optional(),
        description: z.string().nullable().optional(),
        billable: z.boolean().optional(),
      },
      annotations: write,
    },
    ({ entry_id, start_time, end_time, ...rest }) =>
      safe(async () => {
        const patch = entryPatch.parse({
          ...rest,
          ...(start_time ? { start_time: new Date(start_time).toISOString() } : {}),
          ...(end_time ? { end_time: new Date(end_time).toISOString() } : {}),
        });
        const e = await updateEntry(db, entry_id, patch);
        return { id: e.id, start_time: e.start_time, end_time: e.end_time, description: e.description, billable: e.billable };
      }),
  );

  server.registerTool(
    "delete_time_entry",
    { title: "Supprimer une entrée de temps", description: "Supprime une entrée de temps.", inputSchema: { entry_id: id }, annotations: destructive },
    ({ entry_id }) => safe(async () => (await deleteEntries(db, [entry_id]), { deleted: entry_id })),
  );

  // ---------------------------------------------------------------- Facturation
  server.registerTool(
    "add_tasks_to_invoice",
    {
      title: "Ajouter des tâches à une facture",
      description:
        "Facture le temps non facturé des tâches : une ligne par tâche, heures automatiques. Sans invoice_id, crée une nouvelle facture pour le client commun des tâches.",
      inputSchema: { task_ids: z.array(id).min(1), invoice_id: id.optional().describe("Facture non payée existante (sinon nouvelle facture)") },
      annotations: write,
    },
    ({ task_ids, invoice_id }) =>
      safe(async () => {
        const r = await addTasksToInvoice(db, task_ids, invoice_id ?? null);
        const d = await getInvoiceDetail(db, r.invoiceId);
        return { invoice_id: r.invoiceId, number: d?.invoice.number, entries_added: r.entries, total: d?.total, currency: d?.invoice.currency };
      }),
  );

  server.registerTool(
    "create_invoice_from_unbilled",
    {
      title: "Facturer le temps d'un client",
      description: "Crée une facture avec tout le temps non facturé d'un client (période facultative, bornes incluses). Une ligne par tâche.",
      inputSchema: { client_id: id.optional(), client_name: z.string().optional(), from: isoDate.optional(), to: isoDate.optional(), timezone },
      annotations: write,
    },
    ({ client_id, client_name, from, to, timezone: tz }) =>
      safe(async () => {
        const cid = await resolveClientId(db, client_id, client_name);
        if (!cid) throw new DomainError("Précisez client_id ou client_name.");
        const zone = tz ?? "UTC";
        const r = await createInvoiceFromUnbilled(db, cid, { from: from ? dateToZonedIso(from, zone) : null, to: to ? dateToZonedIso(to, zone, 1) : null });
        const d = await getInvoiceDetail(db, r.invoiceId);
        return { invoice_id: r.invoiceId, number: d?.invoice.number, entries_added: r.entries, total: d?.total, currency: d?.invoice.currency };
      }),
  );

  server.registerTool(
    "add_unbilled_to_invoice",
    {
      title: "Compléter une facture",
      description: "Ajoute à une facture non payée tout le temps non facturé de son client (nouvelles entrées depuis sa création).",
      inputSchema: { invoice_id: id },
      annotations: write,
    },
    ({ invoice_id }) => safe(async () => ({ invoice_id, entries_added: await addUnbilledToInvoice(db, invoice_id) })),
  );

  server.registerTool(
    "create_invoice",
    {
      title: "Créer une facture vide",
      description: "Crée une facture non payée vide (numéro, profil émetteur, devise du client et échéance à 30 jours automatiques).",
      inputSchema: { client_id: id.optional(), client_name: z.string().optional() },
      annotations: write,
    },
    ({ client_id, client_name }) =>
      safe(async () => {
        const cid = await resolveClientId(db, client_id, client_name);
        const invoiceId = await createDefaultInvoice(db, cid);
        const d = await getInvoiceDetail(db, invoiceId);
        return { invoice_id: invoiceId, number: d?.invoice.number };
      }),
  );

  server.registerTool(
    "add_invoice_line",
    {
      title: "Ajouter une ligne libre",
      description: "Ajoute une ligne libre (forfait, frais…) à une facture.",
      inputSchema: {
        invoice_id: id,
        description: z.string().min(1),
        quantity: z.number(),
        unit_price: z.number(),
        discount_percent: z.number().min(0).max(100).optional(),
      },
      annotations: write,
    },
    ({ invoice_id, description, quantity, unit_price, discount_percent }) =>
      safe(async () => {
        await addManualItems(db, invoice_id, [{ description, quantity, unit_price, discount: discount_percent ?? 0 }]);
        const d = await getInvoiceDetail(db, invoice_id);
        return { invoice_id, total: d?.total, currency: d?.invoice.currency };
      }),
  );

  server.registerTool(
    "set_invoice_status",
    {
      title: "Changer le statut d'une facture",
      description: "unpaid (modifiable), sent ou paid (temps verrouillé).",
      inputSchema: { invoice_id: id, status: z.enum(["unpaid", "sent", "paid"]) },
      annotations: write,
    },
    ({ invoice_id, status: s }) => safe(async () => (await setInvoiceStatus(db, [invoice_id], s), { invoice_id, status: s })),
  );

  return server;
}

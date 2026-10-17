/**
 * Catalogue des opérations métier exposables à un agent.
 *
 * PRÉPARATION MCP (pas encore de serveur) : chaque entrée deviendra un outil
 * du futur serveur MCP (voir docs/MCP.md). Une opération = un nom stable,
 * une description, un schéma Zod d'entrée et un handler qui reçoit un client
 * Supabase déjà authentifié pour l'utilisateur (la RLS fait le reste).
 *
 * Ce fichier n'importe rien de Next.js : il peut être chargé tel quel par un
 * route handler `/api/mcp` ou par un processus stdio séparé.
 */
import { z } from "zod";
import type { DB } from "./core";
import * as clients from "./clients";
import * as projects from "./projects";
import * as tasks from "./tasks";
import * as entries from "./entries";
import * as timer from "./timer";
import * as invoices from "./invoices";
import * as templates from "./templates";
import * as stats from "./stats";
import {
  clientInput,
  idSchema,
  idsSchema,
  invoiceInput,
  invoiceItemInput,
  invoiceStatusSchema,
  manualEntryInput,
  periodSchema,
  projectInput,
  statsRangeSchema,
  taskInput,
} from "./schemas";

export interface Operation<S extends z.ZodType = z.ZodType> {
  /** Nom stable en snake_case (futur nom d'outil MCP). */
  name: string;
  description: string;
  input: S;
  /** true si l'opération ne modifie rien (annotation readOnlyHint côté MCP). */
  readOnly: boolean;
  handler: (db: DB, input: z.output<S>) => Promise<unknown>;
}

const op = <S extends z.ZodType>(o: Operation<S>) => o as unknown as Operation;

const none = z.object({});
const byId = z.object({ id: idSchema });
const byIds = z.object({ ids: idsSchema });

export const operations: Operation[] = [
  // --- Timer -----------------------------------------------------------------
  op({ name: "timer_status", description: "État du timer : running, paused ou idle, tâche et temps écoulé.", input: none, readOnly: true, handler: (db) => timer.getTimerState(db) }),
  op({ name: "timer_start", description: "Démarre le timer sur une tâche (clôt l'entrée en cours).", input: z.object({ task_id: idSchema }), readOnly: false, handler: (db, i) => timer.startTimer(db, i.task_id) }),
  op({ name: "timer_pause", description: "Met le timer en pause.", input: none, readOnly: false, handler: (db) => timer.pauseTimer(db) }),
  op({ name: "timer_resume", description: "Reprend le timer en pause.", input: none, readOnly: false, handler: (db) => timer.resumeTimer(db) }),
  op({ name: "timer_stop", description: "Arrête le timer.", input: none, readOnly: false, handler: (db) => timer.stopTimer(db) }),

  // --- Clients ---------------------------------------------------------------
  op({ name: "list_clients", description: "Liste les clients.", input: none, readOnly: true, handler: (db) => clients.listClients(db) }),
  op({ name: "create_client", description: "Crée un client.", input: clientInput, readOnly: false, handler: (db, i) => clients.createClient(db, i) }),
  op({ name: "update_client", description: "Met à jour un client.", input: z.object({ id: idSchema, data: clientInput }), readOnly: false, handler: (db, i) => clients.updateClient(db, i.id, i.data) }),
  op({ name: "delete_clients", description: "Supprime des clients.", input: byIds, readOnly: false, handler: (db, i) => clients.deleteClients(db, i.ids) }),

  // --- Projets ---------------------------------------------------------------
  op({ name: "list_projects", description: "Liste les projets (filtre client facultatif).", input: z.object({ client_id: idSchema.optional() }), readOnly: true, handler: (db, i) => projects.listProjects(db, { clientId: i.client_id }) }),
  op({ name: "create_project", description: "Crée un projet.", input: projectInput, readOnly: false, handler: (db, i) => projects.createProject(db, i) }),
  op({ name: "update_project", description: "Met à jour un projet.", input: z.object({ id: idSchema, data: projectInput }), readOnly: false, handler: (db, i) => projects.updateProject(db, i.id, i.data) }),
  op({ name: "delete_projects", description: "Supprime des projets.", input: byIds, readOnly: false, handler: (db, i) => projects.deleteProjects(db, i.ids) }),

  // --- Tâches et temps ---------------------------------------------------------
  op({
    name: "list_tasks",
    description: "Liste les tâches avec projet, client, temps total (secondes) et statut de facturation.",
    input: z.object({ project_id: idSchema.optional(), client_id: idSchema.optional() }),
    readOnly: true,
    handler: (db, i) => tasks.listTaskRows(db, { projectId: i.project_id, clientId: i.client_id }),
  }),
  op({ name: "create_task", description: "Crée une tâche.", input: taskInput, readOnly: false, handler: (db, i) => tasks.createTask(db, i) }),
  op({ name: "update_task", description: "Met à jour une tâche.", input: z.object({ id: idSchema, data: taskInput }), readOnly: false, handler: (db, i) => tasks.updateTask(db, i.id, i.data) }),
  op({ name: "delete_tasks", description: "Supprime des tâches et leur historique.", input: byIds, readOnly: false, handler: (db, i) => tasks.deleteTasks(db, i.ids) }),
  op({ name: "list_task_entries", description: "Historique des entrées de temps d'une tâche.", input: byId, readOnly: true, handler: (db, i) => entries.listEntriesForTask(db, i.id) }),
  op({
    name: "list_entries",
    description: "Entrées de temps qui chevauchent un intervalle ISO 8601 [from, to[.",
    input: z.object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) }),
    readOnly: true,
    handler: (db, i) => entries.listEntriesInRange(db, i.from, i.to),
  }),
  op({ name: "add_time_entry", description: "Ajoute une entrée de temps manuelle.", input: manualEntryInput, readOnly: false, handler: (db, i) => entries.addManualEntry(db, i) }),
  op({ name: "delete_time_entries", description: "Supprime des entrées de temps.", input: byIds, readOnly: false, handler: (db, i) => entries.deleteEntries(db, i.ids) }),

  // --- Statistiques ------------------------------------------------------------
  op({
    name: "dashboard_stats",
    description: "Heures du jour, de la semaine (lundi-dimanche) et du mois, plus répartition par client et projet.",
    input: z.object({ tz: z.string().default("Europe/Paris"), range: statsRangeSchema.default("month") }),
    readOnly: true,
    handler: (db, i) => stats.getDashboardStats(db, i.tz, i.range),
  }),

  // --- Facturation -------------------------------------------------------------
  op({ name: "list_invoices", description: "Liste les factures avec totaux (synchronise d'abord les heures des factures non payées).", input: z.object({ status: invoiceStatusSchema.optional(), client_id: idSchema.optional() }), readOnly: false, handler: (db, i) => invoices.listInvoices(db, { status: i.status, clientId: i.client_id }) }),
  op({ name: "get_invoice", description: "Détail d'une facture : client, émetteur, lignes, totaux.", input: byId, readOnly: false, handler: (db, i) => invoices.getInvoiceDetail(db, i.id) }),
  op({ name: "create_invoice", description: "Crée une facture vide (statut unpaid).", input: invoiceInput, readOnly: false, handler: (db, i) => invoices.createInvoice(db, i) }),
  op({ name: "update_invoice", description: "Met à jour l'en-tête d'une facture.", input: z.object({ id: idSchema, data: invoiceInput }), readOnly: false, handler: (db, i) => invoices.updateInvoice(db, i.id, i.data) }),
  op({ name: "set_invoice_status", description: "Change le statut (unpaid, sent, paid) de factures.", input: z.object({ ids: idsSchema, status: invoiceStatusSchema }), readOnly: false, handler: (db, i) => invoices.setInvoiceStatus(db, i.ids, i.status) }),
  op({ name: "delete_invoices", description: "Supprime des factures.", input: byIds, readOnly: false, handler: (db, i) => invoices.deleteInvoices(db, i.ids) }),
  op({ name: "add_invoice_items", description: "Ajoute des lignes à une facture.", input: z.object({ invoice_id: idSchema, items: z.array(invoiceItemInput).min(1) }), readOnly: false, handler: (db, i) => invoices.addInvoiceItems(db, i.invoice_id, i.items) }),
  op({ name: "delete_invoice_items", description: "Supprime des lignes de facture.", input: byIds, readOnly: false, handler: (db, i) => invoices.deleteInvoiceItems(db, i.ids) }),
  op({ name: "preview_period_invoice", description: "Brouillon de facture d'un client sur une période (1w, 2w, 3w, 1m).", input: z.object({ client_id: idSchema, period: periodSchema }), readOnly: true, handler: (db, i) => invoices.buildPeriodDraft(db, i.client_id, i.period) }),
  op({ name: "list_issuer_profiles", description: "Liste les profils émetteur.", input: none, readOnly: true, handler: (db) => templates.listTemplates(db) }),
];

export function findOperation(name: string): Operation | undefined {
  return operations.find((o) => o.name === name);
}

/** Exécute une opération après validation de son entrée (point d'entrée unique du futur serveur MCP). */
export async function runOperation(db: DB, name: string, rawInput: unknown): Promise<unknown> {
  const operation = findOperation(name);
  if (!operation) throw new Error(`Opération inconnue : ${name}`);
  const input = operation.input.parse(rawInput ?? {});
  return operation.handler(db, input);
}

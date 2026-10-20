/**
 * Schémas de validation des entrées métier, partagés par les Server Actions
 * (formulaires : chaînes, virgule décimale…) et la couche domaine.
 * Le serveur MCP a ses propres schémas « propres » (src/lib/mcp/tools.ts)
 * qui se ramènent à ceux-ci.
 */
import { z } from "zod";
import { CURRENCIES } from "@/lib/currency";
import { parseDecimal } from "@/lib/numbers";

/** Texte facultatif : chaîne vide → null, sinon trim. */
const optionalText = z.preprocess(
  (v) => (v === undefined || v === null ? null : typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v),
  z.string().max(5000).nullable(),
);

const requiredText = (label: string, max = 200) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: `${label} est requis` }).min(1, `${label} est requis`).max(max),
  );

/** Nombre décimal acceptant la virgule (« 12,5 »). */
export const decimal = (label: string) =>
  z.preprocess((v) => parseDecimal(v), z.number({ error: `${label} : nombre invalide` }).refine(Number.isFinite, `${label} : nombre invalide`));

/** Décimal facultatif : vide → null. */
const optionalDecimal = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : parseDecimal(v)),
    z.number({ error: `${label} : nombre invalide` }).min(0, `${label} : doit être positif`).nullable(),
  );

const optionalId = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid().nullable());
const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable(),
);
const isoDateTime = (label: string) => z.iso.datetime({ offset: true, error: `${label} invalide` });

export const currencySchema = z.enum(CURRENCIES);
export const idSchema = z.uuid();
export const idsSchema = z.array(z.uuid()).min(1, "Aucun élément sélectionné");
export const taskStatusSchema = z.enum(["todo", "in_progress", "review", "done"]);
export const taskPrioritySchema = z.enum(["urgent", "high", "normal", "low"]);
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide");

// --- Clients -----------------------------------------------------------------
export const clientInput = z.object({
  name: requiredText("Le nom"),
  hourly_rate: decimal("Taux horaire").pipe(z.number().min(0, "Le taux doit être positif")),
  currency: currencySchema.default("EUR"),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v),
    z.email("Email invalide").nullable().optional().default(null),
  ),
  phone: optionalText.optional().default(null),
  address: optionalText.optional().default(null),
});
export type ClientInput = z.infer<typeof clientInput>;

// --- Projets -----------------------------------------------------------------
export const projectInput = z.object({
  name: requiredText("Le nom"),
  description: optionalText.optional().default(null),
  client_id: optionalId.optional().default(null),
  color: colorSchema.optional().default("#BC6FF1"),
  hourly_rate: optionalDecimal("Taux du projet").optional().default(null),
  billable: z.boolean().optional().default(true),
  archived: z.boolean().optional().default(false),
});
export type ProjectInput = z.infer<typeof projectInput>;

// --- Tâches ------------------------------------------------------------------
const estimateMinutes = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
  z.number().int().min(0).max(100_000).nullable(),
);

export const taskInput = z.object({
  name: requiredText("Le nom", 300),
  description: optionalText.optional().default(null),
  project_id: optionalId.optional().default(null),
  status: taskStatusSchema.optional().default("todo"),
  priority: taskPrioritySchema.nullable().optional().default(null),
  due_date: optionalDate.optional().default(null),
  estimate_minutes: estimateMinutes.optional().default(null),
});
export type TaskInput = z.infer<typeof taskInput>;

/** Modification partielle (édition en ligne d'un champ). */
export const taskPatch = z
  .object({
    name: requiredText("Le nom", 300),
    description: optionalText,
    project_id: optionalId,
    status: taskStatusSchema,
    priority: taskPrioritySchema.nullable(),
    due_date: optionalDate,
    estimate_minutes: estimateMinutes,
    position: z.number(),
  })
  .partial();
export type TaskPatch = z.infer<typeof taskPatch>;

// --- Entrées de temps -----------------------------------------------------------
export const manualEntryInput = z
  .object({
    task_id: idSchema,
    start_time: isoDateTime("Début"),
    end_time: isoDateTime("Fin"),
    description: optionalText.optional().default(null),
    billable: z.boolean().optional().default(true),
  })
  .refine((v) => new Date(v.end_time) > new Date(v.start_time), {
    message: "La fin doit être postérieure au début",
    path: ["end_time"],
  });
export type ManualEntryInput = z.infer<typeof manualEntryInput>;

export const entryPatch = z
  .object({
    task_id: idSchema,
    start_time: isoDateTime("Début"),
    end_time: isoDateTime("Fin"),
    description: optionalText,
    billable: z.boolean(),
  })
  .partial()
  .refine((v) => !v.start_time || !v.end_time || new Date(v.end_time) > new Date(v.start_time), {
    message: "La fin doit être postérieure au début",
    path: ["end_time"],
  });
export type EntryPatch = z.infer<typeof entryPatch>;

// --- Profils émetteur -----------------------------------------------------------
export const templateInput = z.object({
  name: requiredText("Le nom du profil"),
  company_name: z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? ""), z.string().max(200)),
  address: optionalText.optional().default(null),
  email: optionalText.optional().default(null),
  phone: optionalText.optional().default(null),
  website: optionalText.optional().default(null),
  bank_details: optionalText.optional().default(null),
  tax_number: optionalText.optional().default(null),
  logo_url: optionalText.optional().default(null),
});
export type TemplateInput = z.infer<typeof templateInput>;

// --- Factures --------------------------------------------------------------------
export const invoiceStatusSchema = z.enum(["unpaid", "sent", "paid"]);

export const invoiceInput = z.object({
  number: requiredText("Le numéro", 60),
  client_id: optionalId.optional().default(null),
  template_id: optionalId.optional().default(null),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de facture invalide"),
  issue_date: optionalDate.optional().default(null),
  due_date: optionalDate.optional().default(null),
  currency: currencySchema,
  notes: optionalText.optional().default(null),
  footer_text: optionalText.optional().default(null),
});
export type InvoiceInput = z.infer<typeof invoiceInput>;

export const invoiceItemInput = z.object({
  description: z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? ""), z.string().max(1000)),
  quantity: decimal("Quantité"),
  unit_price: decimal("Prix unitaire"),
  discount: decimal("Remise").pipe(z.number().min(0, "Remise entre 0 et 100").max(100, "Remise entre 0 et 100")),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInput>;

/** Création d'une facture depuis le temps non facturé d'un client (période facultative). */
export const invoiceFromUnbilledInput = z.object({
  client_id: idSchema,
  from: optionalDate.optional().default(null),
  to: optionalDate.optional().default(null),
});
export type InvoiceFromUnbilledInput = z.infer<typeof invoiceFromUnbilledInput>;

/** Ajout de temps non facturé à une facture (toutes les tâches du client si task_ids est vide). */
export const addUnbilledInput = z.object({
  invoice_id: idSchema.nullable(),
  client_id: idSchema.nullable().optional(),
  task_ids: z.array(idSchema).optional(),
});
export type AddUnbilledInput = z.infer<typeof addUnbilledInput>;

export const statsRangeSchema = z.enum(["today", "week", "month", "all"]);
export type StatsRange = z.infer<typeof statsRangeSchema>;

/** Premier message d'erreur lisible d'une validation Zod. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides";
}

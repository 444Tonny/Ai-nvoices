/**
 * Schémas de validation des entrées métier.
 * Partagés par les Server Actions et, plus tard, par les outils du serveur MCP
 * (voir docs/MCP.md) : une seule source de vérité pour les contrats d'entrée.
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

const optionalId = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid().nullable());
const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide").nullable(),
);

export const currencySchema = z.enum(CURRENCIES);
export const idSchema = z.uuid();
export const idsSchema = z.array(z.uuid()).min(1, "Aucun élément sélectionné");

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

export const projectInput = z.object({
  name: requiredText("Le nom"),
  description: optionalText.optional().default(null),
  client_id: optionalId.optional().default(null),
});
export type ProjectInput = z.infer<typeof projectInput>;

export const taskInput = z.object({
  name: requiredText("Le nom"),
  description: optionalText.optional().default(null),
  project_id: optionalId.optional().default(null),
  is_completed: z.boolean().optional().default(false),
});
export type TaskInput = z.infer<typeof taskInput>;

export const manualEntryInput = z
  .object({
    task_id: idSchema,
    start_time: z.iso.datetime({ offset: true, error: "Début invalide" }),
    end_time: z.iso.datetime({ offset: true, error: "Fin invalide" }),
  })
  .refine((v) => new Date(v.end_time) > new Date(v.start_time), {
    message: "La fin doit être postérieure au début",
    path: ["end_time"],
  });
export type ManualEntryInput = z.infer<typeof manualEntryInput>;

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
  task_id: optionalId.optional().default(null),
  sync_hours: z.boolean().optional().default(true),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInput>;

export const periodSchema = z.enum(["1w", "2w", "3w", "1m"]);
export type Period = z.infer<typeof periodSchema>;

export const PERIOD_LABELS: Record<Period, string> = {
  "1w": "1 semaine",
  "2w": "2 semaines",
  "3w": "3 semaines",
  "1m": "1 mois",
};

export const statsRangeSchema = z.enum(["today", "week", "month", "all"]);
export type StatsRange = z.infer<typeof statsRangeSchema>;

/** Premier message d'erreur lisible d'une validation Zod. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides";
}

import type { InvoiceTemplate } from "@/lib/types";
import { must, maybe, type DB } from "./core";
import type { TemplateInput } from "./schemas";

export async function listTemplates(db: DB): Promise<InvoiceTemplate[]> {
  return must(await db.from("invoice_templates").select("*").order("created_at"));
}

export async function getTemplate(db: DB, id: string): Promise<InvoiceTemplate | null> {
  return maybe(await db.from("invoice_templates").select("*").eq("id", id).maybeSingle());
}

export async function createTemplate(db: DB, input: TemplateInput): Promise<InvoiceTemplate> {
  return must(await db.from("invoice_templates").insert(input).select().single());
}

export async function updateTemplate(db: DB, id: string, input: TemplateInput): Promise<InvoiceTemplate> {
  return must(await db.from("invoice_templates").update(input).eq("id", id).select().single());
}

export async function deleteTemplates(db: DB, ids: string[]): Promise<void> {
  must(await db.from("invoice_templates").delete().in("id", ids));
}

/** Crée le « Profil principal » si l'utilisateur n'a encore aucun profil émetteur. */
export async function ensureDefaultTemplate(db: DB): Promise<void> {
  must(await db.rpc("ensure_default_template"));
}

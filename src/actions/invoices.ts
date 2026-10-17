"use server";

import { z } from "zod";
import { parse, run } from "./_run";
import {
  idSchema,
  idsSchema,
  invoiceInput,
  invoiceItemInput,
  invoiceStatusSchema,
  periodSchema,
  templateInput,
  currencySchema,
} from "@/lib/domain/schemas";
import {
  addInvoiceItems,
  buildPeriodDraft,
  createInvoice,
  createInvoiceWithItems,
  deleteInvoiceItems,
  deleteInvoices,
  setInvoiceStatus,
  updateInvoice,
  updateInvoiceItem,
  type PeriodDraft,
} from "@/lib/domain/invoices";
import { createTemplate, deleteTemplates, updateTemplate } from "@/lib/domain/templates";
import { requireUser } from "@/lib/supabase/server";
import { DomainError } from "@/lib/domain/core";
import type { ActionResult } from "@/lib/types";

// --- Factures --------------------------------------------------------------
export async function saveInvoiceAction(id: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(invoiceInput, input);
    const inv = id ? await updateInvoice(db, parse(idSchema, id), data) : await createInvoice(db, data);
    return { id: inv.id };
  });
}

export async function setInvoiceStatusAction(ids: string[], status: string) {
  return run((db) => setInvoiceStatus(db, parse(idsSchema, ids), parse(invoiceStatusSchema, status)));
}

export async function deleteInvoicesAction(ids: string[]) {
  return run((db) => deleteInvoices(db, parse(idsSchema, ids)));
}

// --- Lignes ----------------------------------------------------------------
const addItemsInput = z.object({
  invoice_id: idSchema.nullable(),
  client_id: idSchema.nullable().optional(),
  currency: currencySchema.optional(),
  items: z.array(invoiceItemInput).min(1, "Aucune ligne à ajouter"),
});

/** Ajoute des lignes à une facture existante, ou crée une nouvelle facture si `invoice_id` est null. */
export async function addItemsToInvoiceAction(input: unknown) {
  return run(async (db) => {
    const data = parse(addItemsInput, input);
    if (data.invoice_id) {
      await addInvoiceItems(db, data.invoice_id, data.items);
      return { invoice_id: data.invoice_id };
    }
    const inv = await createInvoiceWithItems(db, {
      clientId: data.client_id ?? null,
      currency: data.currency,
      items: data.items,
    });
    return { invoice_id: inv.id };
  });
}

export async function saveInvoiceItemAction(invoiceId: string, itemId: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(invoiceItemInput, input);
    if (itemId) await updateInvoiceItem(db, parse(idSchema, itemId), data);
    else await addInvoiceItems(db, parse(idSchema, invoiceId), [data]);
  });
}

export async function deleteInvoiceItemsAction(ids: string[]) {
  return run((db) => deleteInvoiceItems(db, parse(idsSchema, ids)));
}

// --- Génération depuis une période ------------------------------------------
export async function buildPeriodDraftAction(clientId: string, period: string): Promise<ActionResult<PeriodDraft>> {
  try {
    const { supabase } = await requireUser();
    return { ok: true, data: await buildPeriodDraft(supabase, parse(idSchema, clientId), parse(periodSchema, period)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue" };
  }
}

const draftInput = z.object({
  client_id: idSchema,
  lines: z
    .array(
      z.object({
        task_id: idSchema,
        description: z.string().max(1000),
        hours: z.number().min(0),
        unit_price: z.number().min(0),
      }),
    )
    .min(1, "Le brouillon ne contient aucune ligne"),
});

export async function createInvoiceFromDraftAction(input: unknown) {
  return run(async (db) => {
    const data = parse(draftInput, input);
    const inv = await createInvoiceWithItems(db, {
      clientId: data.client_id,
      items: data.lines.map((l) => ({
        description: l.description,
        quantity: l.hours,
        unit_price: l.unit_price,
        discount: 0,
        task_id: l.task_id,
        // Les heures de la période sont conservées telles quelles.
        sync_hours: false,
      })),
    });
    return { invoice_id: inv.id };
  });
}

// --- Profils émetteur --------------------------------------------------------
export async function saveTemplateAction(id: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(templateInput, input);
    const t = id ? await updateTemplate(db, parse(idSchema, id), data) : await createTemplate(db, data);
    return { id: t.id };
  });
}

export async function deleteTemplatesAction(ids: string[]) {
  return run(async (db) => {
    const parsed = parse(idsSchema, ids);
    const { count } = await db.from("invoice_templates").select("id", { count: "exact", head: true });
    if ((count ?? 0) - parsed.length < 1) throw new DomainError("Conservez au moins un profil émetteur.");
    await deleteTemplates(db, parsed);
  });
}

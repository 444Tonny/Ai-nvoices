"use server";

import { parse, run } from "./_run";
import {
  addUnbilledInput,
  idSchema,
  idsSchema,
  invoiceFromUnbilledInput,
  invoiceInput,
  invoiceItemInput,
  invoiceStatusSchema,
  templateInput,
} from "@/lib/domain/schemas";
import {
  addManualItems,
  addTasksToInvoice,
  addUnbilledToInvoice,
  createInvoice,
  createInvoiceFromUnbilled,
  deleteInvoiceItems,
  deleteInvoices,
  setInvoiceStatus,
  updateInvoice,
  updateInvoiceItem,
} from "@/lib/domain/invoices";
import { createTemplate, deleteTemplates, updateTemplate } from "@/lib/domain/templates";
import { DomainError } from "@/lib/domain/core";
import { getUserTimezone } from "@/lib/tz";
import { dateToZonedIso } from "@/lib/tz-utils";

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

// --- Facturation du temps --------------------------------------------------
/** Une facture en un clic depuis le temps non facturé d'un client. */
export async function createInvoiceFromUnbilledAction(input: unknown) {
  return run(async (db) => {
    const data = parse(invoiceFromUnbilledInput, input);
    const tz = await getUserTimezone();
    return createInvoiceFromUnbilled(db, data.client_id, {
      from: data.from ? dateToZonedIso(data.from, tz) : null,
      to: data.to ? dateToZonedIso(data.to, tz, 1) : null,
    });
  });
}

/** Ajoute le temps non facturé (de tâches précises, ou de tout le client) à une facture existante ou nouvelle. */
export async function addUnbilledAction(input: unknown) {
  return run(async (db) => {
    const data = parse(addUnbilledInput, input);
    if (data.task_ids?.length) return addTasksToInvoice(db, data.task_ids, data.invoice_id);
    if (!data.invoice_id) throw new DomainError("Choisissez une facture ou des tâches.");
    const entries = await addUnbilledToInvoice(db, data.invoice_id);
    return { invoiceId: data.invoice_id, entries };
  });
}

// --- Lignes ----------------------------------------------------------------
export async function saveInvoiceItemAction(invoiceId: string, itemId: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(invoiceItemInput, input);
    if (itemId) await updateInvoiceItem(db, parse(idSchema, itemId), data);
    else await addManualItems(db, parse(idSchema, invoiceId), [data]);
  });
}

export async function deleteInvoiceItemsAction(ids: string[]) {
  return run((db) => deleteInvoiceItems(db, parse(idsSchema, ids)));
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


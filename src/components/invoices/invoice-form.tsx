"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { deleteInvoiceItemsAction, saveInvoiceAction } from "@/actions/invoices";
import { CURRENCIES, formatMoney, getSymbol } from "@/lib/currency";
import { lineAmount } from "@/lib/numbers";
import type { Client, Invoice, InvoiceItemWithProject, InvoiceTemplate } from "@/lib/types";

function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Création / édition d'une facture. La devise est pré-sélectionnée selon le client
 * mais reste modifiable. En édition, « TÂCHES DE LA FACTURE » permet de retirer des lignes.
 */
export function InvoiceFormModal({
  open,
  onClose,
  invoice,
  items = [],
  clients,
  templates,
  nextNumber,
}: {
  open: boolean;
  onClose: () => void;
  invoice?: Invoice | null;
  items?: InvoiceItemWithProject[];
  clients: Pick<Client, "id" | "name" | "currency">[];
  templates: Pick<InvoiceTemplate, "id" | "name">[];
  nextNumber: string;
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const [form, setForm] = useState({
    number: "",
    client_id: "",
    template_id: "",
    currency: "EUR",
    invoice_date: "",
    issue_date: "",
    due_date: "",
    notes: "",
    footer_text: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      invoice
        ? {
            number: invoice.number,
            client_id: invoice.client_id ?? "",
            template_id: invoice.template_id ?? "",
            currency: invoice.currency,
            invoice_date: invoice.invoice_date,
            issue_date: invoice.issue_date ?? "",
            due_date: invoice.due_date ?? "",
            notes: invoice.notes ?? "",
            footer_text: invoice.footer_text ?? "",
          }
        : {
            number: nextNumber,
            client_id: "",
            template_id: templates[0]?.id ?? "",
            currency: "EUR",
            invoice_date: todayIso(),
            issue_date: todayIso(),
            due_date: todayIso(30),
            notes: "",
            footer_text: "",
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onClientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const client = clients.find((c) => c.id === e.target.value);
    setForm((f) => ({ ...f, client_id: e.target.value, currency: client?.currency ?? f.currency }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveInvoiceAction(invoice?.id ?? null, form), invoice ? "Facture mise à jour" : "Facture créée");
    if (res.ok) {
      onClose();
      if (!invoice && res.data?.id) router.push(`/invoices?selected=${res.data.id}`);
    }
  };

  const removeItem = async (item: InvoiceItemWithProject) => {
    if (await confirm(`Retirer « ${item.description || "cette ligne"} » de la facture ?`)) {
      await exec(() => deleteInvoiceItemsAction([item.id]), "Ligne retirée");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title={invoice ? `Modifier la facture ${invoice.number}` : "Nouvelle facture"}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="invoice-form" className="btn btn-primary" disabled={pending}>
            Enregistrer
          </button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Numéro" htmlFor="i-number">
            <input id="i-number" className="input" value={form.number} onChange={set("number")} required />
          </Field>
          <Field label="Client" htmlFor="i-client">
            <select id="i-client" className="select" value={form.client_id} onChange={onClientChange}>
              <option value="">— Sans client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profil émetteur" htmlFor="i-template">
            <select id="i-template" className="select" value={form.template_id} onChange={set("template_id")}>
              <option value="">— Aucun —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Devise" htmlFor="i-currency">
            <select id="i-currency" className="select" value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} ({getSymbol(c)})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Date de facture" htmlFor="i-date">
            <input id="i-date" type="date" className="input" value={form.invoice_date} onChange={set("invoice_date")} required />
          </Field>
          <Field label="Date d'émission" htmlFor="i-issue">
            <input id="i-issue" type="date" className="input" value={form.issue_date} onChange={set("issue_date")} />
          </Field>
          <Field label="Échéance" htmlFor="i-due">
            <input id="i-due" type="date" className="input" value={form.due_date} onChange={set("due_date")} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="i-notes">
          <textarea id="i-notes" className="textarea" rows={3} value={form.notes} onChange={set("notes")} />
        </Field>
        <Field label="Texte de pied de page" htmlFor="i-footer">
          <textarea id="i-footer" className="textarea" rows={2} value={form.footer_text} onChange={set("footer_text")} placeholder="Ex. : Paiement à 30 jours par virement." />
        </Field>
      </form>

      {invoice && (
        <section className="mt-8">
          <h3 className="label mb-3">Tâches de la facture</h3>
          {items.length === 0 ? (
            <p className="text-muted">Aucune ligne.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-ui border border-border bg-surface-2 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate" title={item.description}>
                      {item.description || "—"}
                    </span>
                    <span className="text-[12px] text-muted">
                      {item.project_name ?? "Autres"} · {item.quantity.toLocaleString("fr-FR")} h
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular">{formatMoney(lineAmount(item.quantity, item.unit_price, item.discount), form.currency)}</span>
                    <button type="button" className="btn btn-icon" onClick={() => removeItem(item)} disabled={pending} title="Retirer" aria-label="Retirer">
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Modal>
  );
}

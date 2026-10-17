"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { deleteInvoiceItemsAction, saveInvoiceItemAction } from "@/actions/invoices";
import { formatMoney } from "@/lib/currency";
import { lineAmount, parseDecimal } from "@/lib/numbers";
import { groupByProject } from "@/lib/invoice-groups";
import type { InvoiceDetail } from "@/lib/domain/invoices";
import type { InvoiceItemWithProject } from "@/lib/types";

const toInput = (n: number) => String(n).replace(".", ",");

function ItemFormModal({
  open,
  onClose,
  invoiceId,
  item,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  item: InvoiceItemWithProject | null;
}) {
  const { exec, pending } = useAction();
  const [form, setForm] = useState({ description: "", quantity: "1", unit_price: "0", discount: "0", sync_hours: true });

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            description: item.description,
            quantity: toInput(item.quantity),
            unit_price: toInput(item.unit_price),
            discount: toInput(item.discount),
            sync_hours: item.sync_hours,
          }
        : { description: "", quantity: "1", unit_price: "0", discount: "0", sync_hours: true },
    );
  }, [open, item]);

  const q = parseDecimal(form.quantity);
  const p = parseDecimal(form.unit_price);
  const d = parseDecimal(form.discount || "0");
  const valid = [q, p, d].every(Number.isFinite) && d >= 0 && d <= 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(
      () => saveInvoiceItemAction(invoiceId, item?.id ?? null, { ...form, task_id: item?.task_id ?? null }),
      item ? "Ligne mise à jour" : "Ligne ajoutée",
    );
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "Modifier la ligne" : "Nouvelle ligne"}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="item-form" className="btn btn-primary" disabled={pending || !valid}>
            Enregistrer
          </button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Description" htmlFor="it-desc">
          <input id="it-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-autofocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Quantité (h)" htmlFor="it-q">
            <input id="it-q" className="input tabular" inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Prix unitaire" htmlFor="it-p">
            <input id="it-p" className="input tabular" inputMode="decimal" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
          </Field>
          <Field label="Remise (%)" htmlFor="it-d">
            <input id="it-d" className="input tabular" inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </Field>
        </div>
        {item?.task_id && (
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" className="checkbox" checked={form.sync_hours} onChange={(e) => setForm({ ...form, sync_hours: e.target.checked })} />
            <span>Synchroniser la quantité avec le temps total de la tâche (factures non payées)</span>
          </label>
        )}
        {!valid && <p className="text-[13px] text-danger">Valeurs numériques invalides (remise entre 0 et 100).</p>}
      </form>
    </Modal>
  );
}

/** Panneau inline « LIGNES DE FACTURE », regroupées par projet s'il y en a plusieurs. */
export function InvoiceItemsPanel({ detail }: { detail: InvoiceDetail }) {
  const { invoice, items } = detail;
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const selection = useSelection(items.map((i) => i.id));
  const [editing, setEditing] = useState<InvoiceItemWithProject | null>(null);
  const [creating, setCreating] = useState(false);
  const groups = groupByProject(items);
  const frozen = invoice.status !== "unpaid";

  const remove = async (ids: string[]) => (await exec(() => deleteInvoiceItemsAction(ids), "Lignes supprimées")).ok;
  const removeOne = async (item: InvoiceItemWithProject) => {
    if (await confirm(`Supprimer la ligne « ${item.description || "sans description"} » ?`)) await remove([item.id]);
  };

  let index = 0;
  const renderRow = (item: InvoiceItemWithProject) => {
    index += 1;
    return (
      <tr key={item.id} className={selection.has(item.id) ? "row-selected" : ""}>
        <td>
          <RowCheckbox selection={selection} id={item.id} />
        </td>
        <td className="tabular text-muted">{index}</td>
        <td>
          <span className="truncate-cell" style={{ maxWidth: 360 }} title={item.description}>
            {item.description || <span className="text-dim">—</span>}
          </span>
          {item.task_id && !frozen && item.sync_hours && <span className="text-[11px] text-dim">heures synchronisées</span>}
        </td>
        <td className="tabular text-right">{item.quantity.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
        <td className="tabular whitespace-nowrap text-right">{formatMoney(item.unit_price, invoice.currency)}</td>
        <td className="tabular text-right">{item.discount > 0 ? `${item.discount.toLocaleString("fr-FR")} %` : "—"}</td>
        <td className="tabular whitespace-nowrap text-right">{formatMoney(lineAmount(item.quantity, item.unit_price, item.discount), invoice.currency)}</td>
        <td>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="btn btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(item)}>
              ✎
            </button>
            <button type="button" className="btn btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => removeOne(item)} disabled={pending}>
              🗑
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <section className="card mt-6 px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[17px]">Lignes de facture · {invoice.number}</h3>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
          + Ajouter une ligne
        </button>
      </div>
      {frozen && (
        <p className="mb-4 text-[13px] text-warning">
          Facture {invoice.status === "paid" ? "payée" : "envoyée"} : les heures sont figées et ne suivent plus le temps des tâches.
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-8 text-center text-muted">Aucune ligne. Ajoutez des tâches depuis l&apos;écran Tâches ou une ligne libre.</p>
      ) : (
        <>
          <div className="mb-4">
            <BulkBar selection={selection} onDelete={remove} noun="ligne" disabled={pending} />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">
                    <SelectAllCheckbox selection={selection} />
                  </th>
                  <th className="w-10">#</th>
                  <th>Description</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right">Prix unitaire</th>
                  <th className="text-right">Remise</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.length > 1
                  ? groups.map((g) => [
                      <tr key={`g-${g.name}`} className="bg-surface-2">
                        <td colSpan={8} className="text-[12px] font-semibold uppercase tracking-wider text-accent">
                          {g.name}
                        </td>
                      </tr>,
                      ...g.items.map(renderRow),
                    ])
                  : items.map(renderRow)}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-col items-end gap-1.5">
            <p className="text-muted">
              Sous-total : <span className="tabular text-text">{formatMoney(detail.subtotal, invoice.currency)}</span>
            </p>
            {detail.subtotal !== detail.total && (
              <p className="text-muted">
                Remises : <span className="tabular text-text">−{formatMoney(detail.subtotal - detail.total, invoice.currency)}</span>
              </p>
            )}
            <p className="text-[18px]">
              Total : <span className="tabular font-semibold text-accent">{formatMoney(detail.total, invoice.currency)}</span>
            </p>
          </div>
        </>
      )}

      <ItemFormModal open={creating || editing !== null} item={editing} invoiceId={invoice.id} onClose={() => (setCreating(false), setEditing(null))} />
    </section>
  );
}

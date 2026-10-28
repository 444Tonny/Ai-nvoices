"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Client, InvoiceItemWithProject, InvoiceStatus, InvoiceTemplate } from "@/lib/types";
import type { InvoiceDetail, UnbilledClient } from "@/lib/domain/invoices";
import { addUnbilledAction, deleteInvoiceItemsAction, deleteInvoicesAction, saveInvoiceItemAction, setInvoiceStatusAction } from "@/actions/invoices";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { Modal } from "@/components/ui/modal";
import { Field, StatusBadge } from "@/components/ui/misc";
import { ColorDot } from "@/components/ui/pills";
import { formatMoney } from "@/lib/currency";
import { formatDay, formatHoursMinutes } from "@/lib/format";
import { lineAmount, parseDecimal } from "@/lib/numbers";
import { groupByProject } from "@/lib/invoice-groups";
import { InvoiceFormModal } from "./invoice-form";
import { faClock, faLock, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";
import { faCircleCheck, faFilePdf, faPaperPlane, faPen, faPlus, faRotateLeft, faTrashCan } from "@fortawesome/free-solid-svg-icons";

const STATUS_ACTIONS: { status: InvoiceStatus; label: string; className: string; icon: IconDefinition }[] = [
  { status: "sent", label: "Marquer envoyée", className: "btn-warning", icon: faPaperPlane },
  { status: "paid", label: "Marquer payée", className: "btn-success", icon: faCircleCheck },
  { status: "unpaid", label: "Repasser non payée", className: "", icon: faRotateLeft },
];

const toInput = (n: number) => String(n).replace(".", ",");

/** Ligne libre ou modification d'une ligne (la quantité d'une ligne de temps suit ses entrées). */
function ItemFormModal({ open, onClose, invoiceId, item }: { open: boolean; onClose: () => void; invoiceId: string; item: InvoiceItemWithProject | null }) {
  const { exec, pending } = useAction();
  const [form, setForm] = useState({ description: "", quantity: "1", unit_price: "0", discount: "0" });
  const isTime = item?.source === "time";

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? { description: item.description, quantity: toInput(item.quantity), unit_price: toInput(item.unit_price), discount: toInput(item.discount) }
        : { description: "", quantity: "1", unit_price: "0", discount: "0" },
    );
  }, [open, item]);

  const q = parseDecimal(form.quantity);
  const p = parseDecimal(form.unit_price);
  const d = parseDecimal(form.discount || "0");
  const valid = [q, p, d].every(Number.isFinite) && d >= 0 && d <= 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveInvoiceItemAction(invoiceId, item?.id ?? null, form), item ? "Ligne mise à jour" : "Ligne ajoutée");
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "Modifier la ligne" : "Ligne libre (forfait, frais…)"}
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
            <input id="it-q" className="input tabular" inputMode="decimal" value={form.quantity} disabled={isTime} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Prix unitaire" htmlFor="it-p">
            <input id="it-p" className="input tabular" inputMode="decimal" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
          </Field>
          <Field label="Remise (%)" htmlFor="it-d">
            <input id="it-d" className="input tabular" inputMode="decimal" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </Field>
        </div>
        {isTime && <p className="text-[13px] text-muted">Les heures de cette ligne suivent les entrées de temps qu&apos;elle facture.</p>}
        {!valid && <p className="text-[13px] text-danger">Valeurs numériques invalides (remise entre 0 et 100).</p>}
      </form>
    </Modal>
  );
}

export function InvoiceEditor({
  detail,
  unbilled,
  clients,
  templates,
  nextNumber,
}: {
  detail: InvoiceDetail;
  /** Temps non facturé du client de la facture (factures non payées uniquement). */
  unbilled: UnbilledClient | null;
  clients: Pick<Client, "id" | "name" | "currency">[];
  templates: Pick<InvoiceTemplate, "id" | "name" | "default_footer_text">[];
  nextNumber: string;
}) {
  const router = useRouter();
  const { invoice, items, client, template } = detail;
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const selection = useSelection(items.map((i) => i.id));
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceItemWithProject | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const frozen = invoice.status !== "unpaid";
  const groups = groupByProject(items);
  const hours = items.filter((i) => i.source === "time").reduce((s, i) => s + i.quantity, 0);

  const removeItems = async (ids: string[]) => {
    const hasTime = items.some((i) => ids.includes(i.id) && i.source === "time");
    if (hasTime && frozen) {
      const ok = await confirm({ message: "Cette facture est envoyée ou payée. Retirer ces lignes rendra leur temps de nouveau « à facturer ». Continuer ?", confirmLabel: "Retirer" });
      if (!ok) return false;
    }
    return (await exec(() => deleteInvoiceItemsAction(ids), "Lignes retirées : leur temps redevient à facturer")).ok;
  };

  const removeOne = async (item: InvoiceItemWithProject) => {
    if (await confirm(`Retirer « ${item.description || "cette ligne"} »${item.source === "time" ? " ? Son temps redeviendra à facturer." : " ?"}`)) await removeItems([item.id]);
  };

  const removeInvoice = async () => {
    if (!(await confirm(`Supprimer la facture ${invoice.number} ? Le temps qu'elle facture redeviendra à facturer.`))) return;
    const res = await exec(() => deleteInvoicesAction([invoice.id]), "Facture supprimée");
    if (res.ok) router.push("/invoices?tab=invoices");
  };

  const addUnbilled = () => exec(() => addUnbilledAction({ invoice_id: invoice.id }), "Temps ajouté à la facture");

  let index = 0;
  const renderRow = (item: InvoiceItemWithProject) => {
    index += 1;
    return (
      <tr key={item.id} className={selection.has(item.id) ? "row-selected" : ""}>
        <td>
          <RowCheckbox selection={selection} id={item.id} />
        </td>
        <td className="tabular text-muted">{index}</td>
        <td className="min-w-[220px]">
          <span className="truncate-cell" style={{ maxWidth: 380 }} title={item.description}>
            {item.task_id ? (
              <Link href={`/tasks/${item.task_id}`} className="hover:text-primary">
                {item.description || "—"}
              </Link>
            ) : (
              item.description || <span className="text-dim">—</span>
            )}
          </span>
          {item.source === "time" ? (
            <span className="text-[11px] text-muted">
              <Icon icon={faClock} className="mr-1" /> {item.entry_count} entrée{item.entry_count > 1 ? "s" : ""} de temps{frozen ? " · verrouillée" : ""}
            </span>
          ) : (
            <span className="text-[11px] text-dim">Ligne libre</span>
          )}
        </td>
        <td className="tabular text-right">{item.quantity.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
        <td className="tabular whitespace-nowrap text-right">{formatMoney(item.unit_price, invoice.currency)}</td>
        <td className="tabular text-right">{item.discount > 0 ? `${item.discount.toLocaleString("fr-FR")} %` : "—"}</td>
        <td className="tabular whitespace-nowrap text-right">{formatMoney(lineAmount(item.quantity, item.unit_price, item.discount), invoice.currency)}</td>
        <td>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="btn btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditingItem(item)}>
              <Icon icon={faPen} />
            </button>
            <button type="button" className="btn btn-icon" title="Retirer" aria-label="Retirer" onClick={() => removeOne(item)} disabled={pending}>
              <Icon icon={faTrashCan} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[26px] leading-tight">
            Facture {invoice.number} <StatusBadge status={invoice.status} />
          </h1>
          <p className="mt-1.5 text-muted">
            {client ? (
              <Link href={`/clients/${client.id}`} className="link">
                {client.name}
              </Link>
            ) : (
              "Sans client"
            )}
            {" · "}du {formatDay(invoice.invoice_date)}
            {invoice.due_date && <> · échéance {formatDay(invoice.due_date)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener" className="btn btn-primary">
            <Icon icon={faFilePdf} /> Générer PDF
          </a>
          {STATUS_ACTIONS.filter((a) => a.status !== invoice.status).map((a) => (
            <button key={a.status} type="button" className={`btn ${a.className}`} disabled={pending} onClick={() => exec(() => setInvoiceStatusAction([invoice.id], a.status), "Statut mis à jour")}>
              <Icon icon={a.icon} /> {a.label}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => setEditingHeader(true)}>
            <Icon icon={faPen} /> Modifier
          </button>
          <button type="button" className="btn btn-danger" onClick={removeInvoice} disabled={pending}>
            <Icon icon={faTrashCan} /> Supprimer
          </button>
        </div>
      </div>

      {frozen && (
        <p className="mb-5 rounded-ui border border-warning/40 bg-warning/10 px-4 py-3 text-[14px] text-warning">
          <Icon icon={faLock} className="mr-2" />Facture {invoice.status === "paid" ? "payée" : "envoyée"} : le temps qu&apos;elle facture est verrouillé et ses heures ne bougent plus.
        </p>
      )}
      {!frozen && unbilled && unbilled.seconds > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-ui border border-primary/40 bg-secondary/30 px-4 py-3">
          <span className="text-[14px]">
            <span className="text-warning">{formatHoursMinutes(unbilled.seconds)}</span> non facturées pour {unbilled.client_name} ({formatMoney(unbilled.amount, unbilled.currency)}).
          </span>
          <button type="button" className="btn btn-sm btn-primary ml-auto" onClick={addUnbilled} disabled={pending}>
            <Icon icon={faPlus} /> Ajouter ce temps à la facture
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0 px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px]">Lignes</h2>
            <button type="button" className="btn btn-sm" onClick={() => setAddingItem(true)}>
              <Icon icon={faPlus} /> Ligne libre
            </button>
          </div>
          {items.length === 0 ? (
            <p className="py-10 text-center text-muted">
              Aucune ligne. Ajoutez du temps depuis l&apos;onglet « À facturer », la page d&apos;un projet ou d&apos;une tâche, ou une ligne libre.
            </p>
          ) : (
            <>
              <div className="mb-4">
                <BulkBar selection={selection} onDelete={removeItems} noun="ligne" disabled={pending} />
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
                              <span className="inline-flex items-center gap-2">
                                <ColorDot color={g.items[0]?.project_color} /> {g.name}
                              </span>
                            </td>
                          </tr>,
                          ...g.items.map(renderRow),
                        ])
                      : items.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-5 flex flex-col items-end gap-1.5">
            {hours > 0 && <p className="text-[13px] text-muted">Temps facturé : {hours.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} h</p>}
            <p className="text-muted">
              Sous-total : <span className="tabular text-text">{formatMoney(detail.subtotal, invoice.currency)}</span>
            </p>
            {detail.subtotal !== detail.total && (
              <p className="text-muted">
                Remises : <span className="tabular text-text">−{formatMoney(detail.subtotal - detail.total, invoice.currency)}</span>
              </p>
            )}
            <p className="text-[20px]">
              Total : <span className="tabular font-semibold text-accent">{formatMoney(detail.total, invoice.currency)}</span>
            </p>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="card px-5 py-4">
            <p className="label">Émetteur</p>
            <p>{template?.company_name || template?.name || "—"}</p>
            {template?.email && <p className="text-[13px] text-muted">{template.email}</p>}
            <Link href="/settings" className="link mt-2 inline-block text-[13px]">
              Gérer les profils émetteur
            </Link>
          </div>
          <div className="card px-5 py-4">
            <p className="label">Facturé à</p>
            <p>{client?.name ?? "—"}</p>
            {client?.address && <p className="whitespace-pre-line text-[13px] text-muted">{client.address}</p>}
          </div>
          {(invoice.notes || invoice.footer_text) && (
            <div className="card px-5 py-4">
              {invoice.notes && (
                <>
                  <p className="label">Notes</p>
                  <p className="mb-3 whitespace-pre-line text-[13px]">{invoice.notes}</p>
                </>
              )}
              {invoice.footer_text && (
                <>
                  <p className="label">Pied de page</p>
                  <p className="whitespace-pre-line text-[13px] text-muted">{invoice.footer_text}</p>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <InvoiceFormModal open={editingHeader} onClose={() => setEditingHeader(false)} invoice={invoice} clients={clients} templates={templates} nextNumber={nextNumber} />
      <ItemFormModal open={addingItem || editingItem !== null} item={editingItem} invoiceId={invoice.id} onClose={() => (setAddingItem(false), setEditingItem(null))} />
    </>
  );
}

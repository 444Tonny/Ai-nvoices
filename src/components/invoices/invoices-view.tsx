"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Client, InvoiceRow, InvoiceStatus, InvoiceTemplate } from "@/lib/types";
import type { InvoiceDetail } from "@/lib/domain/invoices";
import { deleteInvoicesAction, setInvoiceStatusAction } from "@/actions/invoices";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState, NameLink, StatusBadge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/currency";
import { formatDay } from "@/lib/format";
import { InvoiceFormModal } from "./invoice-form";
import { PeriodInvoiceModal } from "./period-invoice-modal";
import { InvoiceItemsPanel } from "./invoice-items-panel";

const FILTERS: { id: InvoiceStatus | "all"; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "unpaid", label: "Non payées" },
  { id: "sent", label: "Envoyées" },
  { id: "paid", label: "Payées" },
];

const STATUS_ACTIONS: { status: InvoiceStatus; label: string; className: string }[] = [
  { status: "paid", label: "Marquer payée", className: "btn-success" },
  { status: "sent", label: "Marquer envoyée", className: "btn-warning" },
  { status: "unpaid", label: "Marquer non payée", className: "" },
];

export function InvoicesView({
  invoices,
  filter,
  detail,
  clients,
  templates,
  nextNumber,
}: {
  invoices: InvoiceRow[];
  filter: InvoiceStatus | "all";
  detail: InvoiceDetail | null;
  clients: Pick<Client, "id" | "name" | "currency">[];
  templates: Pick<InvoiceTemplate, "id" | "name">[];
  nextNumber: string;
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const selection = useSelection(invoices.map((i) => i.id));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState(false);
  const selected = detail?.invoice ?? null;

  const href = (opts: { status?: string; selected?: string | null }) => {
    const params = new URLSearchParams();
    const s = opts.status ?? filter;
    if (s !== "all") params.set("status", s);
    const sel = opts.selected === undefined ? selected?.id : opts.selected;
    if (sel) params.set("selected", sel);
    const q = params.toString();
    return q ? `/invoices?${q}` : "/invoices";
  };

  const select = (id: string) => router.push(href({ selected: selected?.id === id ? null : id }), { scroll: false });

  const remove = async (ids: string[]) => {
    const res = await exec(() => deleteInvoicesAction(ids), ids.length > 1 ? "Factures supprimées" : "Facture supprimée");
    if (res.ok && selected && ids.includes(selected.id)) router.replace(href({ selected: null }), { scroll: false });
    return res.ok;
  };

  const removeSelected = async () => {
    if (!selected) return;
    if (await confirm(`Supprimer la facture ${selected.number} et toutes ses lignes ?`)) await remove([selected.id]);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <Link key={f.id} href={href({ status: f.id, selected: null })} className={`btn btn-sm ${filter === f.id ? "btn-primary" : ""}`} scroll={false}>
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={() => setPeriod(true)}>
            Générer depuis une période
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            + Nouvelle facture
          </button>
        </div>
      </div>

      <div className="mb-4">
        <BulkBar selection={selection} onDelete={remove} noun="facture" disabled={pending || invoices.length === 0} />
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "Aucune facture" : "Aucune facture avec ce statut"}
          hint="Créez une facture, générez-la depuis une période ou ajoutez des tâches depuis l'écran Tâches."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th>Statut</th>
                <th>Numéro</th>
                <th>Client</th>
                <th>Date</th>
                <th>Échéance</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const isSelected = selected?.id === inv.id;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => select(inv.id)}
                    className={`cursor-pointer ${isSelected || selection.has(inv.id) ? "row-selected" : ""}`}
                    aria-selected={isSelected}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <RowCheckbox selection={selection} id={inv.id} />
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="whitespace-nowrap">
                      <button type="button" className="link" onClick={(e) => (e.stopPropagation(), select(inv.id))}>
                        {inv.number}
                      </button>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {inv.client ? <NameLink href={`/clients/${inv.client.id}`} text={inv.client.name} max={220} /> : <span className="text-dim">—</span>}
                    </td>
                    <td className="tabular whitespace-nowrap">{formatDay(inv.invoice_date)}</td>
                    <td className="tabular whitespace-nowrap">{formatDay(inv.due_date)}</td>
                    <td className="tabular whitespace-nowrap text-right">{formatMoney(inv.total, inv.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && selected && (
        <>
          <div className="card mt-6 flex flex-wrap items-center gap-3 px-6 py-4">
            <span className="mr-2 flex items-center gap-3">
              <span className="text-[16px]">{selected.number}</span>
              <StatusBadge status={selected.status} />
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              ✎ Modifier
            </button>
            <a href={`/api/invoices/${selected.id}/pdf`} target="_blank" rel="noopener" className="btn btn-sm btn-primary">
              Générer PDF
            </a>
            {STATUS_ACTIONS.filter((a) => a.status !== selected.status).map((a) => (
              <button
                key={a.status}
                type="button"
                className={`btn btn-sm ${a.className}`}
                disabled={pending}
                onClick={() => exec(() => setInvoiceStatusAction([selected.id], a.status), "Statut mis à jour")}
              >
                {a.label}
              </button>
            ))}
            <button type="button" className="btn btn-sm btn-danger ml-auto" onClick={removeSelected} disabled={pending}>
              Supprimer
            </button>
          </div>
          <InvoiceItemsPanel detail={detail} />
        </>
      )}

      <InvoiceFormModal
        open={creating}
        onClose={() => setCreating(false)}
        clients={clients}
        templates={templates}
        nextNumber={nextNumber}
      />
      <InvoiceFormModal
        open={editing && detail !== null}
        onClose={() => setEditing(false)}
        invoice={selected}
        items={detail?.items}
        clients={clients}
        templates={templates}
        nextNumber={nextNumber}
      />
      <PeriodInvoiceModal open={period} onClose={() => setPeriod(false)} clients={clients} />
    </>
  );
}

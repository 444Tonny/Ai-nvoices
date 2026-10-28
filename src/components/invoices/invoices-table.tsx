"use client";

import Link from "next/link";
import { useState } from "react";
import type { Client, InvoiceRow, InvoiceStatus, InvoiceTemplate } from "@/lib/types";
import { deleteInvoicesAction, setInvoiceStatusAction } from "@/actions/invoices";
import { useAction } from "@/components/ui/use-action";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState, NameLink, StatusBadge } from "@/components/ui/misc";
import { Menu } from "@/components/ui/menu";
import { formatMoney } from "@/lib/currency";
import { formatDay } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { InvoiceFormModal } from "./invoice-form";
import { faChevronDown, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

const FILTERS: { id: InvoiceStatus | "all"; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "unpaid", label: "Non payées" },
  { id: "sent", label: "Envoyées" },
  { id: "paid", label: "Payées" },
];

export function InvoicesTable({
  invoices,
  clients,
  templates,
  nextNumber,
  today,
}: {
  invoices: InvoiceRow[];
  clients: Pick<Client, "id" | "name" | "currency">[];
  templates: Pick<InvoiceTemplate, "id" | "name" | "default_footer_text">[];
  nextNumber: string;
  /** Date du jour (YYYY-MM-DD, fuseau de l'utilisateur) pour signaler les retards. */
  today: string;
}) {
  const { exec, pending } = useAction();
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const visible = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);
  const selection = useSelection(visible.map((i) => i.id));

  const remove = async (ids: string[]) => (await exec(() => deleteInvoicesAction(ids), "Suppression effectuée")).ok;
  const bulkStatus = async (status: InvoiceStatus) => {
    const res = await exec(() => setInvoiceStatusAction(selection.ids, status), "Statut mis à jour");
    if (res.ok) selection.clear();
  };

  const totals = new Map<string, number>();
  for (const i of visible) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.total);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`btn btn-sm ${filter === f.id ? "btn-primary" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label} ({f.id === "all" ? invoices.length : invoices.filter((i) => i.status === f.id).length})
          </button>
        ))}
        <button type="button" className="btn ml-auto" onClick={() => setCreating(true)}>
          <Icon icon={faPlus} /> Facture vide
        </button>
      </div>

      {visible.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <BulkBar selection={selection} onDelete={remove} noun="facture" disabled={pending}>
            <Menu<InvoiceStatus>
              trigger={<span className={`btn btn-sm ${selection.count === 0 ? "pointer-events-none opacity-50" : ""}`}>Marquer comme <Icon icon={faChevronDown} /></span>}
              disabled={selection.count === 0}
              items={(Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((s) => ({ value: s, label: INVOICE_STATUS[s].label }))}
              onSelect={bulkStatus}
            />
          </BulkBar>
          <span className="ml-auto text-muted">
            Total : <span className="tabular text-text">{[...totals.entries()].map(([c, a]) => formatMoney(a, c)).join(" + ")}</span>
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState title="Aucune facture" hint="Générez une facture depuis l'onglet « À facturer » ou créez une facture vide." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th>Numéro</th>
                <th>Client</th>
                <th>Date</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => {
                const overdue = inv.status !== "paid" && inv.due_date !== null && inv.due_date < today;
                return (
                  <tr key={inv.id} className={selection.has(inv.id) ? "row-selected" : ""}>
                    <td>
                      <RowCheckbox selection={selection} id={inv.id} />
                    </td>
                    <td className="whitespace-nowrap">
                      <Link href={`/invoices/${inv.id}`} className="link">
                        {inv.number}
                      </Link>
                    </td>
                    <td>{inv.client ? <NameLink href={`/clients/${inv.client.id}`} text={inv.client.name} max={220} /> : <span className="text-dim">—</span>}</td>
                    <td className="tabular whitespace-nowrap">{formatDay(inv.invoice_date)}</td>
                    <td className={`tabular whitespace-nowrap ${overdue ? "text-danger" : ""}`}>
                      {formatDay(inv.due_date)}
                      {overdue && <span className="ml-2 text-[11px] uppercase tracking-wider">en retard</span>}
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="tabular whitespace-nowrap text-right">{formatMoney(inv.total, inv.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <InvoiceFormModal open={creating} onClose={() => setCreating(false)} clients={clients} templates={templates} nextNumber={nextNumber} />
    </>
  );
}

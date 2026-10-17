"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { buildPeriodDraftAction, createInvoiceFromDraftAction } from "@/actions/invoices";
import { PERIOD_LABELS, type Period } from "@/lib/domain/schemas";
import type { DraftLine, PeriodDraft } from "@/lib/domain/invoices";
import { formatMoney } from "@/lib/currency";
import { lineAmount, round2 } from "@/lib/numbers";
import { formatDate } from "@/lib/format";
import { groupByProject } from "@/lib/invoice-groups";
import type { Client } from "@/lib/types";

/**
 * « Générer depuis une période » : brouillon des tâches ayant du temps sur la
 * période (heures × taux du client), lignes retirables, puis création de la facture.
 */
export function PeriodInvoiceModal({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: Pick<Client, "id" | "name">[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const { exec, pending } = useAction();
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState<Period>("1m");
  const [draft, setDraft] = useState<PeriodDraft | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(false);
  const selection = useSelection(lines.map((l) => l.task_id));

  useEffect(() => {
    if (open) {
      setClientId((c) => c || clients[0]?.id || "");
      setDraft(null);
      setLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const compute = async () => {
    if (!clientId) return;
    setLoading(true);
    const res = await buildPeriodDraftAction(clientId, period);
    setLoading(false);
    if (!res.ok) return toast(res.error, "error");
    setDraft(res.data!);
    setLines(res.data!.lines);
  };

  const removeLines = async (ids: string[]) => {
    setLines((ls) => ls.filter((l) => !ids.includes(l.task_id)));
  };

  const currency = draft?.client.currency ?? "EUR";
  const total = round2(lines.reduce((s, l) => s + lineAmount(l.hours, l.unit_price), 0));
  const groups = groupByProject(lines);

  const create = async () => {
    if (!draft || lines.length === 0) return;
    const res = await exec(
      () =>
        createInvoiceFromDraftAction({
          client_id: draft.client.id,
          lines: lines.map((l) => ({ task_id: l.task_id, description: l.task_name, hours: l.hours, unit_price: l.unit_price })),
        }),
      "Facture créée",
    );
    if (res.ok && res.data) {
      onClose();
      router.push(`/invoices?selected=${res.data.invoice_id}`);
    }
  };

  const renderRow = (l: DraftLine) => (
    <tr key={l.task_id} className={selection.has(l.task_id) ? "row-selected" : ""}>
      <td>
        <RowCheckbox selection={selection} id={l.task_id} />
      </td>
      <td>
        <span className="truncate-cell" title={l.task_name}>
          {l.task_name}
        </span>
        {l.already_invoiced && <span className="text-[12px] text-warning">(déjà facturé ailleurs)</span>}
      </td>
      <td className="tabular text-right">{l.hours.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
      <td className="tabular text-right">{formatMoney(l.unit_price, currency)}</td>
      <td className="tabular text-right">{formatMoney(lineAmount(l.hours, l.unit_price), currency)}</td>
      <td className="text-right">
        <button type="button" className="btn btn-icon" title="Retirer" aria-label="Retirer" onClick={() => removeLines([l.task_id])}>
          ✕
        </button>
      </td>
    </tr>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={820}
      title="Générer une facture depuis une période"
      footer={
        <>
          {draft && (
            <span className="mr-auto self-center text-muted">
              Total : <span className="tabular text-[16px] text-text">{formatMoney(total, currency)}</span>
            </span>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={!draft || lines.length === 0 || pending}>
            Créer la facture
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {clients.length === 0 ? (
          <p className="text-muted">Créez d&apos;abord un client.</p>
        ) : (
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_200px_auto]">
            <Field label="Client" htmlFor="pd-client">
              <select id="pd-client" className="select" value={clientId} onChange={(e) => (setClientId(e.target.value), setDraft(null))}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Période" htmlFor="pd-period">
              <select id="pd-period" className="select" value={period} onChange={(e) => (setPeriod(e.target.value as Period), setDraft(null))}>
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <button type="button" className="btn btn-primary" onClick={compute} disabled={loading || !clientId}>
              {loading ? "Calcul…" : "Calculer"}
            </button>
          </div>
        )}

        {draft && (
          <>
            <p className="text-[13px] text-muted">
              Du {formatDate(draft.from)} au {formatDate(draft.to)} · taux {formatMoney(draft.client.hourly_rate, currency)}/h
            </p>
            {lines.length === 0 ? (
              <p className="card px-6 py-8 text-center text-muted">Aucune tâche avec du temps sur cette période.</p>
            ) : (
              <>
                <BulkBar selection={selection} onDelete={removeLines} noun="ligne" />
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="w-10">
                          <SelectAllCheckbox selection={selection} />
                        </th>
                        <th>Tâche</th>
                        <th className="text-right">Heures</th>
                        <th className="text-right">Taux</th>
                        <th className="text-right">Montant</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {groups.length > 1
                        ? groups.map((g) => [
                            <tr key={`g-${g.name}`} className="bg-surface-2">
                              <td colSpan={6} className="text-[12px] font-semibold uppercase tracking-wider text-accent">
                                {g.name}
                              </td>
                            </tr>,
                            ...g.items.map(renderRow),
                          ])
                        : lines.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

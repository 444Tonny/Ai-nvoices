"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/ui/use-action";
import { addItemsToInvoiceAction } from "@/actions/invoices";
import type { InvoiceOption } from "@/lib/domain/invoices";
import type { TaskRow } from "@/lib/types";
import { formatMoney } from "@/lib/currency";
import { lineAmount, parseDecimal, round2 } from "@/lib/numbers";
import { secondsToHours } from "@/lib/format";

const NEW = "__new__";
const STATUS_LABEL = { unpaid: "non payée", sent: "envoyée", paid: "payée" } as const;

interface Line {
  task_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount: string;
  /** Heures par défaut (temps total de la tâche) : si inchangées, la ligne reste synchronisée. */
  default_quantity: number;
}

const toInput = (n: number) => String(n).replace(".", ",");

/**
 * Ajout d'une ou plusieurs tâches à une facture existante ou nouvelle.
 * Heures = temps total de la tâche, taux = taux du client, total en direct.
 */
export function AddToInvoiceModal({
  tasks,
  invoices,
  onClose,
  onDone,
}: {
  tasks: TaskRow[];
  invoices: InvoiceOption[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const open = tasks.length > 0;
  const [invoiceId, setInvoiceId] = useState<string>(NEW);
  const [lines, setLines] = useState<Line[]>([]);

  // Client commun à toutes les tâches (pour une nouvelle facture).
  const commonClient = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.client?.id ?? null));
    return ids.size === 1 ? (tasks[0]?.client ?? null) : null;
  }, [tasks]);

  useEffect(() => {
    if (!open) return;
    setLines(
      tasks.map((t) => {
        const hours = secondsToHours(t.total_seconds);
        return {
          task_id: t.id,
          description: t.project ? `${t.name}` : t.name,
          quantity: toInput(hours),
          unit_price: toInput(t.client?.hourly_rate ?? 0),
          discount: "0",
          default_quantity: hours,
        };
      }),
    );
    const firstMatching = invoices.find((i) => i.status === "unpaid" && commonClient && i.client_id === commonClient.id);
    setInvoiceId(firstMatching?.id ?? NEW);
    // Initialisé à l'ouverture uniquement : un rafraîchissement ne doit pas effacer la saisie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tasks.map((t) => t.id).join(",")]);

  const selectedInvoice = invoices.find((i) => i.id === invoiceId) ?? null;
  const currency = selectedInvoice?.currency ?? commonClient?.currency ?? "EUR";

  const parsed = lines.map((l) => ({
    ...l,
    q: parseDecimal(l.quantity),
    p: parseDecimal(l.unit_price),
    d: parseDecimal(l.discount === "" ? "0" : l.discount),
  }));
  const invalid = parsed.some((l) => !Number.isFinite(l.q) || !Number.isFinite(l.p) || !Number.isFinite(l.d) || l.d < 0 || l.d > 100);
  const total = round2(parsed.reduce((s, l) => s + (invalid ? 0 : lineAmount(l.q, l.p, l.d)), 0));

  const update = (i: number, key: keyof Line, value: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));

  const submit = async () => {
    if (invalid || parsed.length === 0) return;
    const res = await exec(
      () =>
        addItemsToInvoiceAction({
          invoice_id: invoiceId === NEW ? null : invoiceId,
          client_id: invoiceId === NEW ? (commonClient?.id ?? null) : undefined,
          currency: invoiceId === NEW ? currency : undefined,
          items: parsed.map((l) => ({
            description: l.description,
            quantity: l.q,
            unit_price: l.p,
            discount: l.d,
            task_id: l.task_id,
            sync_hours: round2(l.q) === round2(l.default_quantity),
          })),
        }),
      "Lignes ajoutées à la facture",
    );
    if (res.ok) {
      onDone?.();
      onClose();
      if (res.data?.invoice_id) router.push(`/invoices?selected=${res.data.invoice_id}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={860}
      title={tasks.length > 1 ? `Ajouter ${tasks.length} tâches à une facture` : "Ajouter à une facture"}
      footer={
        <>
          <span className="mr-auto self-center text-muted">
            Total : <span className="tabular text-[16px] text-text">{formatMoney(total, currency)}</span>
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || invalid || lines.length === 0}>
            Valider
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <label className="label" htmlFor="invoice-target">Facture</label>
          <select id="invoice-target" className="select" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value={NEW}>+ Créer une nouvelle facture{commonClient ? ` (${commonClient.name})` : ""}</option>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {i.client_name ?? "Sans client"} · {STATUS_LABEL[i.status]}
              </option>
            ))}
          </select>
          {selectedInvoice && selectedInvoice.status !== "unpaid" && (
            <p className="mt-2 text-[13px] text-warning">Cette facture est {STATUS_LABEL[selectedInvoice.status]} : ses heures ne seront plus synchronisées.</p>
          )}
          {invoiceId === NEW && !commonClient && tasks.length > 1 && (
            <p className="mt-2 text-[13px] text-muted">Les tâches appartiennent à plusieurs clients : la nouvelle facture sera créée sans client.</p>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-muted">Toutes les lignes ont été retirées.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="w-28">Qté (h)</th>
                  <th className="w-32">Prix unitaire</th>
                  <th className="w-24">Remise %</th>
                  <th className="text-right">Total</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {parsed.map((l, i) => (
                  <tr key={l.task_id}>
                    <td className="min-w-[200px]">
                      <input className="input" value={l.description} onChange={(e) => update(i, "description", e.target.value)} aria-label="Description" />
                    </td>
                    <td>
                      <input className="input tabular" inputMode="decimal" value={l.quantity} onChange={(e) => update(i, "quantity", e.target.value)} aria-label="Quantité" />
                    </td>
                    <td>
                      <input className="input tabular" inputMode="decimal" value={l.unit_price} onChange={(e) => update(i, "unit_price", e.target.value)} aria-label="Prix unitaire" />
                    </td>
                    <td>
                      <input className="input tabular" inputMode="decimal" value={l.discount} onChange={(e) => update(i, "discount", e.target.value)} aria-label="Remise" />
                    </td>
                    <td className="tabular whitespace-nowrap text-right">
                      {Number.isFinite(l.q) && Number.isFinite(l.p) && Number.isFinite(l.d) ? formatMoney(lineAmount(l.q, l.p, l.d), currency) : <span className="text-danger">invalide</span>}
                    </td>
                    <td>
                      <button type="button" className="btn btn-icon" title="Retirer la ligne" aria-label="Retirer la ligne" onClick={() => removeLine(i)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12px] text-dim">
          Les lignes dont les heures restent égales au temps total de la tâche suivront automatiquement ce temps tant que la facture est non payée.
        </p>
      </div>
    </Modal>
  );
}

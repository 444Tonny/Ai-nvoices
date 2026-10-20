"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useAction } from "@/components/ui/use-action";
import { addUnbilledAction } from "@/actions/invoices";
import type { InvoiceOption } from "@/lib/domain/invoices";
import type { TaskRow } from "@/lib/types";
import { formatHoursMinutes } from "@/lib/format";

const NEW = "__new__";

/**
 * « Facturer » des tâches : leur temps non facturé part sur une facture
 * non payée existante ou sur une nouvelle facture (client commun).
 */
export function BillTasksModal({ tasks, invoices, onClose, onDone }: { tasks: TaskRow[]; invoices: InvoiceOption[]; onClose: () => void; onDone?: () => void }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [target, setTarget] = useState(NEW);
  const open = tasks.length > 0;

  const clientIds = new Set(tasks.map((t) => t.client?.id ?? null));
  const commonClient = clientIds.size === 1 ? tasks[0]?.client ?? null : null;
  const unbilled = tasks.reduce((s, t) => s + t.unbilled_seconds, 0);
  const withoutTime = tasks.filter((t) => t.unbilled_seconds === 0);
  const candidates = commonClient ? invoices.filter((i) => i.client_id === commonClient.id) : invoices;

  useEffect(() => {
    if (open) setTarget(candidates[0]?.id ?? NEW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tasks.map((t) => t.id).join(",")]);

  const submit = async () => {
    const res = await exec(
      () => addUnbilledAction({ invoice_id: target === NEW ? null : target, task_ids: tasks.map((t) => t.id) }),
      "Temps ajouté à la facture",
    );
    if (res.ok && res.data) {
      onDone?.();
      onClose();
      router.push(`/invoices/${res.data.invoiceId}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tasks.length > 1 ? `Facturer ${tasks.length} tâches` : `Facturer « ${tasks[0]?.name ?? ""} »`}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || unbilled === 0}>
            Facturer {formatHoursMinutes(unbilled)}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-muted">
          Temps non facturé : <span className="duration text-[16px]">{formatHoursMinutes(unbilled)}</span>. Chaque tâche devient une ligne dont les heures suivent
          ses entrées de temps.
        </p>
        {withoutTime.length > 0 && (
          <p className="rounded-ui border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-warning">
            {withoutTime.length === tasks.length ? "Aucune de ces tâches n'a" : `${withoutTime.length} tâche(s) n'ont`} de temps à facturer.
          </p>
        )}
        <div>
          <label className="label" htmlFor="bill-target">Facture</label>
          <select id="bill-target" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value={NEW}>+ Nouvelle facture{commonClient ? ` pour ${commonClient.name}` : ""}</option>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {i.client_name ?? "Sans client"}
              </option>
            ))}
          </select>
          {!commonClient && tasks.length > 1 && target === NEW && (
            <p className="mt-2 text-[13px] text-muted">Tâches de plusieurs clients : la nouvelle facture sera créée sans client.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

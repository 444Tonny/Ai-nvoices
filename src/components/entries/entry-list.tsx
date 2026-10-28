"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteEntriesAction, updateEntryAction } from "@/actions/entries";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { ColorDot } from "@/components/ui/pills";
import { useTimer } from "@/components/timer/timer-provider";
import { entrySeconds, formatDate, formatHMS, formatTime } from "@/lib/format";
import type { TimeEntryWithTask } from "@/lib/types";
import { ManualEntryForm, type TaskOption } from "./manual-entry-form";
import { faEuroSign, faLock, faPen, faPlay, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

/** Badge de facturation d'une entrée : facture (verrouillée si envoyée/payée) ou non facturée. */
export function BillingBadge({ entry }: { entry: Pick<TimeEntryWithTask, "invoice" | "billable"> }) {
  if (entry.invoice) {
    const locked = entry.invoice.status !== "unpaid";
    return (
      <Link
        href={`/invoices/${entry.invoice.id}`}
        className={`badge whitespace-nowrap ${locked ? "bg-success/15 text-success" : "bg-secondary text-text"}`}
        title={locked ? "Facturé (facture envoyée ou payée) : verrouillé" : "Sur une facture non payée"}
      >
        {locked && <Icon icon={faLock} className="mr-1.5" />}
        {entry.invoice.number}
      </Link>
    );
  }
  if (!entry.billable) return <span className="badge bg-surface-3 text-dim">Non facturable</span>;
  return <span className="badge bg-warning/15 text-warning">À facturer</span>;
}

/** Liste d'entrées de temps : édition, facturable, suppression par ligne et groupée. */
export function EntryList({
  entries,
  tasks = [],
  showTask = false,
  showDate = true,
  onChanged,
}: {
  entries: TimeEntryWithTask[];
  /** Tâches proposées lors de l'édition (changement de tâche). */
  tasks?: TaskOption[];
  showTask?: boolean;
  showDate?: boolean;
  /** Appelé après une modification réussie (listes chargées côté client). */
  onChanged?: () => void;
}) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const { now, tz, start, state } = useTimer();
  const selection = useSelection(entries.map((e) => e.id));
  const [editing, setEditing] = useState<TimeEntryWithTask | null>(null);

  const done = (ok: boolean) => {
    if (ok) onChanged?.();
    return ok;
  };
  const remove = async (ids: string[]) => done((await exec(() => deleteEntriesAction(ids), ids.length > 1 ? "Entrées supprimées" : "Entrée supprimée")).ok);
  const removeOne = async (id: string) => {
    if (await confirm("Supprimer cette entrée de temps ?")) await remove([id]);
  };
  const toggleBillable = async (e: TimeEntryWithTask) => done((await exec(() => updateEntryAction(e.id, { billable: !e.billable }))).ok);

  if (entries.length === 0) {
    return <EmptyState title="Aucune entrée de temps" hint="Démarrez le timer ou ajoutez une entrée manuelle." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <BulkBar selection={selection} onDelete={remove} noun="entrée" disabled={pending} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10">
                <SelectAllCheckbox selection={selection} />
              </th>
              {showTask && <th>Tâche</th>}
              <th>Description</th>
              {showDate && <th>Date</th>}
              <th>Horaires</th>
              <th className="text-right">Durée</th>
              <th>Facturation</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const locked = Boolean(e.invoice && e.invoice.status !== "unpaid");
              return (
                <tr key={e.id} className={selection.has(e.id) ? "row-selected" : e.end_time === null ? "row-active" : ""}>
                  <td>
                    <RowCheckbox selection={selection} id={e.id} />
                  </td>
                  {showTask && (
                    <td className="min-w-[200px]">
                      {e.task ? (
                        <div className="min-w-0">
                          <Link href={`/tasks/${e.task.id}`} className="link truncate-cell" style={{ maxWidth: 260 }} title={e.task.name}>
                            {e.task.name}
                          </Link>
                          {e.task.project_name && (
                            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                              <ColorDot color={e.task.project_color} size={8} />
                              <span className="truncate">{e.task.project_name}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                  )}
                  <td className="min-w-[160px]">
                    <span className="truncate-cell text-[13px] text-muted" style={{ maxWidth: 280 }} title={e.description ?? ""}>
                      {e.description || <span className="text-dim">—</span>}
                    </span>
                  </td>
                  {showDate && <td className="tabular whitespace-nowrap">{formatDate(e.start_time, tz)}</td>}
                  <td className="tabular whitespace-nowrap text-[13px]">
                    {formatTime(e.start_time, tz)} – {e.end_time ? formatTime(e.end_time, tz) : <span className="text-success">en cours</span>}
                  </td>
                  <td className="duration text-right">{formatHMS(entrySeconds(e.start_time, e.end_time, now))}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`btn btn-icon ${e.billable ? "text-success" : "text-dim"}`}
                        title={e.billable ? "Facturable (cliquer pour exclure)" : "Non facturable (cliquer pour inclure)"}
                        aria-label="Basculer facturable"
                        disabled={locked || pending}
                        onClick={() => toggleBillable(e)}
                      >
                        <Icon icon={faEuroSign} />
                      </button>
                      <BillingBadge entry={e} />
                    </div>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      {e.task && e.end_time && (
                        <button
                          type="button"
                          className="btn btn-icon"
                          title="Reprendre cette tâche"
                          aria-label="Reprendre cette tâche"
                          disabled={state.status === "running" && state.task?.id === e.task.id}
                          onClick={() => start(e.task!.id)}
                        >
                          <Icon icon={faPlay} />
                        </button>
                      )}
                      <button type="button" className="btn btn-icon" title={locked ? "Verrouillée (facture envoyée ou payée)" : "Modifier"} aria-label="Modifier" disabled={locked} onClick={() => setEditing(e)}>
                        <Icon icon={faPen} />
                      </button>
                      <button type="button" className="btn btn-icon" title={locked ? "Verrouillée" : "Supprimer"} aria-label="Supprimer" onClick={() => removeOne(e.id)} disabled={pending || locked}>
                        <Icon icon={faTrashCan} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Modifier l'entrée">
        {editing && (
          <ManualEntryForm
            entry={editing}
            tasks={tasks.length ? tasks : editing.task ? [{ id: editing.task.id, name: editing.task.name, project_name: editing.task.project_name }] : []}
            onDone={() => {
              setEditing(null);
              onChanged?.();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

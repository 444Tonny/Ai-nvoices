"use client";

import { useState } from "react";
import type { TaskRow } from "@/lib/types";
import type { InvoiceOption } from "@/lib/domain/invoices";
import { deleteTasksAction } from "@/actions/catalog";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState, NameLink } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { useTimer } from "@/components/timer/timer-provider";
import { ManualEntryForm } from "@/components/entries/manual-entry-form";
import { formatHMS } from "@/lib/format";
import { TaskFormModal, type ProjectOption } from "./task-form";
import { TaskHistoryModal } from "./task-history-modal";
import { AddToInvoiceModal } from "./add-to-invoice-modal";

/** Temps total d'une tâche, actualisé en direct si elle est en cours. */
export function LiveTaskTime({ task, renderedAt }: { task: Pick<TaskRow, "total_seconds" | "is_running">; renderedAt: number }) {
  const { now } = useTimer();
  const secs = task.total_seconds + (task.is_running ? Math.max(0, (now - renderedAt) / 1000) : 0);
  return <span className="duration">{formatHMS(secs)}</span>;
}

export function TaskStatusBadges({ task, running }: { task: TaskRow; running: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {running ? (
        <span className="badge bg-success/15 text-success">En cours</span>
      ) : task.is_completed ? (
        <span className="badge bg-surface-3 text-muted">Terminée</span>
      ) : (
        <span className="badge bg-info/20 text-accent">Ouverte</span>
      )}
      {task.is_invoiced && <span className="badge bg-secondary text-text">Facturé</span>}
    </div>
  );
}

export function TasksTable({
  tasks,
  projects,
  invoices,
  renderedAt,
  defaultProjectId,
  hideProjectColumns = false,
}: {
  tasks: TaskRow[];
  projects: ProjectOption[];
  invoices: InvoiceOption[];
  /** Horodatage (ms) du rendu serveur, base du temps en direct. */
  renderedAt: number;
  defaultProjectId?: string;
  hideProjectColumns?: boolean;
}) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const { state, start, pending: timerPending } = useTimer();
  const selection = useSelection(tasks.map((t) => t.id));

  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState<TaskRow | null>(null);
  const [entryFor, setEntryFor] = useState<TaskRow | null>(null);
  const [invoiceTasks, setInvoiceTasks] = useState<TaskRow[]>([]);

  const runningId = state.status === "running" ? state.task?.id : null;

  const remove = async (ids: string[]) => (await exec(() => deleteTasksAction(ids), "Suppression effectuée")).ok;
  const removeOne = async (t: TaskRow) => {
    if (await confirm(`Supprimer la tâche « ${t.name} » et tout son historique de temps ?`)) await remove([t.id]);
  };

  const newButton = (
    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
      + Nouvelle tâche
    </button>
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BulkBar selection={selection} onDelete={remove} noun="tâche" disabled={pending || tasks.length === 0}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={selection.count === 0}
            onClick={() => setInvoiceTasks(tasks.filter((t) => selection.has(t.id)))}
          >
            🧾 Ajouter à une facture
          </button>
        </BulkBar>
        {newButton}
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="Aucune tâche" hint="Créez une tâche puis démarrez le timer pour suivre votre temps." action={newButton} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th>Tâche</th>
                {!hideProjectColumns && <th>Projet</th>}
                {!hideProjectColumns && <th>Client</th>}
                <th className="text-right">Temps total</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const running = runningId === t.id;
                return (
                  <tr key={t.id} className={selection.has(t.id) ? "row-selected" : running ? "row-active" : ""}>
                    <td>
                      <RowCheckbox selection={selection} id={t.id} />
                    </td>
                    <td>
                      <NameLink href={`/tasks/${t.id}`} text={t.name} max={240} />
                    </td>
                    {!hideProjectColumns && (
                      <td>{t.project ? <NameLink href={`/projects/${t.project.id}`} text={t.project.name} max={180} /> : <span className="text-dim">—</span>}</td>
                    )}
                    {!hideProjectColumns && (
                      <td>{t.client ? <NameLink href={`/clients/${t.client.id}`} text={t.client.name} max={180} /> : <span className="text-dim">—</span>}</td>
                    )}
                    <td className="whitespace-nowrap text-right">
                      <LiveTaskTime task={t} renderedAt={renderedAt} />
                    </td>
                    <td>
                      <TaskStatusBadges task={t} running={running} />
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          className={`btn btn-icon ${running ? "" : "btn-success"}`}
                          title={running ? "Déjà en cours" : "Démarrer le timer"}
                          onClick={() => start(t.id)}
                          disabled={running || timerPending}
                        >
                          ▶ Start
                        </button>
                        <button type="button" className="btn btn-icon" title="Ajouter une entrée manuelle" onClick={() => setEntryFor(t)}>
                          + Entrée
                        </button>
                        <button type="button" className="btn btn-icon" title="Historique des entrées" onClick={() => setHistory(t)}>
                          🕐 Hist.
                        </button>
                        <button type="button" className="btn btn-icon" title="Ajouter à une facture" onClick={() => setInvoiceTasks([t])}>
                          🧾 Facture
                        </button>
                        <button type="button" className="btn btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(t)}>
                          ✎
                        </button>
                        <button type="button" className="btn btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => removeOne(t)} disabled={pending}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TaskFormModal
        open={creating || editing !== null}
        task={editing}
        projects={projects}
        defaultProjectId={defaultProjectId}
        onClose={() => (setCreating(false), setEditing(null))}
      />
      <TaskHistoryModal task={history} onClose={() => setHistory(null)} />
      <Modal open={entryFor !== null} onClose={() => setEntryFor(null)} title={`Nouvelle entrée · ${entryFor?.name ?? ""}`}>
        {entryFor && <ManualEntryForm taskId={entryFor.id} onDone={() => setEntryFor(null)} onCancel={() => setEntryFor(null)} />}
      </Modal>
      <AddToInvoiceModal tasks={invoiceTasks} invoices={invoices} onClose={() => setInvoiceTasks([])} onDone={selection.clear} />
    </>
  );
}

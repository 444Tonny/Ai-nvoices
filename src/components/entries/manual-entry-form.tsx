"use client";

import { useState } from "react";
import { addManualEntryAction, updateEntryAction } from "@/actions/entries";
import { useAction } from "@/components/ui/use-action";
import { toDateTimeLocal } from "@/lib/format";

export interface TaskOption {
  id: string;
  name: string;
  project_name: string | null;
  project_color?: string | null;
}

export interface EditableEntry {
  id: string;
  task_id: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
  billable: boolean;
}

/**
 * Saisie ou modification d'une entrée de temps.
 * `taskId` fixe la tâche ; sinon un sélecteur est proposé (`tasks`).
 */
export function ManualEntryForm({
  taskId,
  tasks = [],
  defaultDate,
  entry,
  onDone,
  onCancel,
}: {
  taskId?: string;
  tasks?: TaskOption[];
  defaultDate?: Date;
  entry?: EditableEntry;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { exec, pending } = useAction();
  const base = defaultDate ? new Date(defaultDate) : new Date();
  if (defaultDate) base.setHours(9, 0, 0, 0);
  const defaultStart = defaultDate ? base : new Date(base.getTime() - 60 * 60_000);
  const defaultEnd = defaultDate ? new Date(base.getTime() + 60 * 60_000) : base;

  const [selectedTask, setSelectedTask] = useState(entry?.task_id ?? taskId ?? tasks[0]?.id ?? "");
  const [startValue, setStartValue] = useState(toDateTimeLocal(entry ? new Date(entry.start_time) : defaultStart));
  const [endValue, setEndValue] = useState(toDateTimeLocal(entry?.end_time ? new Date(entry.end_time) : defaultEnd));
  const [description, setDescription] = useState(entry?.description ?? "");
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [error, setError] = useState<string | null>(null);
  const running = entry && !entry.end_time;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedTask) return setError("Choisissez une tâche.");
    const s = new Date(startValue);
    const en = new Date(endValue);
    if (Number.isNaN(s.getTime()) || (!running && Number.isNaN(en.getTime()))) return setError("Dates invalides.");
    if (!running && en <= s) return setError("La fin doit être postérieure au début.");
    const payload = {
      task_id: selectedTask,
      start_time: s.toISOString(),
      ...(running ? {} : { end_time: en.toISOString() }),
      description,
      billable,
    };
    const res = await exec(
      () => (entry ? updateEntryAction(entry.id, payload) : addManualEntryAction(payload)),
      entry ? "Entrée mise à jour" : "Entrée ajoutée",
    );
    if (res.ok) onDone?.();
  };

  const durationMin = Math.max(0, Math.round((new Date(endValue).getTime() - new Date(startValue).getTime()) / 60_000));

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!taskId && (
        <div>
          <label className="label" htmlFor="entry-task">Tâche</label>
          {tasks.length === 0 ? (
            <p className="text-muted">Aucune tâche disponible. Créez d&apos;abord une tâche.</p>
          ) : (
            <select id="entry-task" className="select" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.project_name ? ` · ${t.project_name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div>
        <label className="label" htmlFor="entry-desc">Description (facultatif)</label>
        <input id="entry-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sur quoi avez-vous travaillé ?" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="entry-start">Début</label>
          <input id="entry-start" type="datetime-local" className="input" value={startValue} onChange={(e) => setStartValue(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="entry-end">Fin</label>
          {running ? (
            <p className="flex min-h-[38px] items-center text-success">En cours</p>
          ) : (
            <input id="entry-end" type="datetime-local" className="input" value={endValue} onChange={(e) => setEndValue(e.target.value)} required />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
          <input type="checkbox" className="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
          Facturable
        </label>
        {!running && (
          <p className="text-[13px] text-muted">
            Durée : <span className="duration">{Math.floor(durationMin / 60)}h {String(durationMin % 60).padStart(2, "0")}m</span>
          </p>
        )}
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending || (!taskId && !entry && tasks.length === 0)}>
          {entry ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}

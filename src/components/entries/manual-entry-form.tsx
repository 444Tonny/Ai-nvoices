"use client";

import { useState } from "react";
import { addManualEntryAction } from "@/actions/entries";
import { useAction } from "@/components/ui/use-action";
import { toDateTimeLocal } from "@/lib/format";

export interface TaskOption {
  id: string;
  name: string;
  project_name: string | null;
}

/**
 * Saisie manuelle d'une plage de temps. Si `taskId` est fourni, la tâche est fixe ;
 * sinon un sélecteur de tâche est affiché (`tasks`).
 */
export function ManualEntryForm({
  taskId,
  tasks = [],
  defaultDate,
  onDone,
  onCancel,
}: {
  taskId?: string;
  tasks?: TaskOption[];
  defaultDate?: Date;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const { exec, pending } = useAction();
  const base = defaultDate ? new Date(defaultDate) : new Date();
  if (defaultDate) base.setHours(9, 0, 0, 0);
  const end = new Date(base.getTime() + (defaultDate ? 60 : 0) * 60_000);
  const start = defaultDate ? base : new Date(base.getTime() - 60 * 60_000);

  const [selectedTask, setSelectedTask] = useState(taskId ?? tasks[0]?.id ?? "");
  const [startValue, setStartValue] = useState(toDateTimeLocal(start));
  const [endValue, setEndValue] = useState(toDateTimeLocal(end));
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedTask) return setError("Choisissez une tâche.");
    const s = new Date(startValue);
    const en = new Date(endValue);
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) return setError("Dates invalides.");
    if (en <= s) return setError("La fin doit être postérieure au début.");
    const res = await exec(
      () => addManualEntryAction({ task_id: selectedTask, start_time: s.toISOString(), end_time: en.toISOString() }),
      "Entrée ajoutée",
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="entry-start">Début</label>
          <input id="entry-start" type="datetime-local" className="input" value={startValue} onChange={(e) => setStartValue(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="entry-end">Fin</label>
          <input id="entry-end" type="datetime-local" className="input" value={endValue} onChange={(e) => setEndValue(e.target.value)} required />
        </div>
      </div>
      <p className="text-[13px] text-muted">
        Durée : <span className="duration">{Math.floor(durationMin / 60)}h {String(durationMin % 60).padStart(2, "0")}m</span>
      </p>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending || (!taskId && tasks.length === 0)}>
          Ajouter
        </button>
      </div>
    </form>
  );
}

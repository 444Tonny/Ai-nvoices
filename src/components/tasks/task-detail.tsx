"use client";

import { useState } from "react";
import type { TaskRow, TimeEntry } from "@/lib/types";
import { useTimer } from "@/components/timer/timer-provider";
import { useAction } from "@/components/ui/use-action";
import { Modal } from "@/components/ui/modal";
import { EntryList } from "@/components/entries/entry-list";
import { ManualEntryForm } from "@/components/entries/manual-entry-form";
import { setTaskCompletedAction } from "@/actions/catalog";
import { formatMoney } from "@/lib/currency";
import { round2 } from "@/lib/numbers";
import { LiveTaskTime, TaskStatusBadges } from "./tasks-table";

export function TaskDetail({ task, entries, renderedAt }: { task: TaskRow; entries: TimeEntry[]; renderedAt: number }) {
  const { state, start, pending: timerPending } = useTimer();
  const { exec, pending } = useAction();
  const [adding, setAdding] = useState(false);
  const running = state.status === "running" && state.task?.id === task.id;
  const value = task.client ? round2((task.total_seconds / 3600) * task.client.hourly_rate) : null;

  return (
    <>
      <section className="mb-9 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="card px-6 py-5">
          <p className="label mb-2">Temps total</p>
          <p className="text-[26px] font-semibold">
            <LiveTaskTime task={task} renderedAt={renderedAt} />
          </p>
        </div>
        <div className="card px-6 py-5">
          <p className="label mb-2">Entrées</p>
          <p className="duration text-[26px] font-semibold">{entries.length}</p>
        </div>
        <div className="card px-6 py-5">
          <p className="label mb-2">Valeur</p>
          <p className="duration text-[26px] font-semibold">{value !== null && task.client ? formatMoney(value, task.client.currency) : "—"}</p>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <TaskStatusBadges task={task} running={running} />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <button type="button" className="btn btn-success" onClick={() => start(task.id)} disabled={running || timerPending}>
          ▶ Start
        </button>
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          + Entrée
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => exec(() => setTaskCompletedAction(task.id, !task.is_completed), task.is_completed ? "Tâche rouverte" : "Tâche terminée")}
        >
          {task.is_completed ? "Rouvrir la tâche" : "Marquer terminée"}
        </button>
      </div>

      {task.description && (
        <div className="card mb-9 px-6 py-5">
          <p className="label">Description</p>
          <p className="whitespace-pre-line">{task.description}</p>
        </div>
      )}

      <h2 className="mb-4 text-[20px]">Historique des entrées</h2>
      <EntryList entries={entries} />

      <Modal open={adding} onClose={() => setAdding(false)} title={`Nouvelle entrée · ${task.name}`}>
        <ManualEntryForm taskId={task.id} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Modal>
    </>
  );
}

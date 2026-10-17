"use client";

import { formatHMS } from "@/lib/format";
import { useTimer } from "./timer-provider";
import { CompactButton } from "./compact-button";
import { TaskSwitcher } from "./task-switcher";

/** Widget timer toujours visible en haut à droite du layout. */
export function TimerWidget() {
  const { state, elapsed, pause, resume, stop, pending, setSwitcherOpen } = useTimer();
  const running = state.status === "running";
  const paused = state.status === "paused";

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5 sm:gap-3">
      <div
        className={`flex min-w-0 items-center gap-3 rounded-ui border bg-surface-1 px-4 py-1.5 ${
          running ? "border-success/60" : paused ? "border-warning/60" : "border-border"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-ui ${running ? "animate-pulse bg-success" : paused ? "bg-warning" : "bg-dim"}`}
          aria-hidden
        />
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate text-[13px] leading-tight" title={state.task?.name ?? ""}>
            {state.task?.name ?? "Aucun timer actif"}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted">
            {state.task
              ? [state.task.project_name, state.task.client_name].filter(Boolean).join(" · ") || "Sans projet"
              : "Ctrl/⌘ + K pour démarrer"}
          </p>
        </div>
        <span
          className={`tabular text-[18px] font-semibold ${running ? "text-success" : paused ? "text-warning" : "text-dim"}`}
          aria-live="off"
        >
          {formatHMS(elapsed)}
        </span>
      </div>

      {running && (
        <button type="button" className="btn btn-sm btn-warning" onClick={pause} disabled={pending}>
          ⏸ Pause
        </button>
      )}
      {paused && (
        <button type="button" className="btn btn-sm btn-success" onClick={resume} disabled={pending}>
          ▶ Reprendre
        </button>
      )}
      {(running || paused) && (
        <button type="button" className="btn btn-sm btn-danger" onClick={stop} disabled={pending}>
          ■ Stop
        </button>
      )}
      <button type="button" className="btn btn-sm" onClick={() => setSwitcherOpen(true)} disabled={pending}>
        Switch
      </button>
      <CompactButton />
      <TaskSwitcher />
    </div>
  );
}

/** Encart « Aujourd'hui » de la sidebar, mis à jour chaque seconde. */
export function TodayTotal() {
  const { todaySeconds } = useTimer();
  return (
    <div className="card px-4 py-3.5">
      <p className="label mb-1">Aujourd&apos;hui</p>
      <p className="duration text-[22px] font-semibold">{formatHMS(todaySeconds)}</p>
    </div>
  );
}

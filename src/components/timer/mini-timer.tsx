"use client";

import { formatHMS } from "@/lib/format";
import { useTimer } from "./timer-provider";

/** Contenu du mini-timer flottant (Picture-in-Picture ou popup réduite). */
export function MiniTimer() {
  const { state, elapsed, pause, resume, stop, pending } = useTimer();
  const color = state.status === "running" ? "text-success" : state.status === "paused" ? "text-warning" : "text-dim";

  return (
    <div className="flex h-full min-h-[110px] flex-col justify-center gap-3 bg-page p-4 text-text">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px]" title={state.task?.name ?? ""}>
            {state.task?.name ?? "Aucun timer actif"}
          </p>
          {state.task?.project_name && <p className="truncate text-[12px] text-muted">{state.task.project_name}</p>}
        </div>
        <span className={`tabular text-[24px] font-semibold ${color}`}>{formatHMS(elapsed)}</span>
      </div>
      <div className="flex gap-2">
        {state.status === "running" && (
          <button type="button" className="btn btn-sm btn-warning flex-1" onClick={pause} disabled={pending}>
            ⏸ Pause
          </button>
        )}
        {state.status === "paused" && (
          <button type="button" className="btn btn-sm btn-success flex-1" onClick={resume} disabled={pending}>
            ▶ Reprendre
          </button>
        )}
        {state.status !== "idle" && (
          <button type="button" className="btn btn-sm btn-danger flex-1" onClick={stop} disabled={pending}>
            ■ Stop
          </button>
        )}
      </div>
    </div>
  );
}

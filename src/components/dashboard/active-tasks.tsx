"use client";

import Link from "next/link";
import type { TaskRow } from "@/lib/types";
import { useTimer } from "@/components/timer/timer-provider";
import { ColorDot, StatusPill } from "@/components/ui/pills";
import { LiveTaskTime } from "@/components/tasks/tasks-view";
import { faPause, faPlay } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

/** Tâches en cours / en revue avec démarrage rapide du timer. */
export function ActiveTasks({ tasks, renderedAt }: { tasks: TaskRow[]; renderedAt: number }) {
  const { state, start, pause, pending } = useTimer();
  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-muted">
        Aucune tâche en cours.{" "}
        <Link href="/tasks" className="link">
          Choisir une tâche
        </Link>
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {tasks.slice(0, 8).map((t) => {
        const running = state.status === "running" && state.task?.id === t.id;
        return (
          <li key={t.id} className={`flex items-center gap-3 rounded-ui px-2 py-2 hover:bg-surface-2 ${running ? "bg-success/10" : ""}`}>
            <ColorDot color={t.project?.color} />
            <span className="min-w-0 flex-1">
              <Link href={`/tasks/${t.id}`} className="block truncate hover:text-primary" title={t.name}>
                {t.name}
              </Link>
              <span className="block truncate text-[12px] text-muted">{t.project?.name ?? "Sans projet"}</span>
            </span>
            {t.status === "review" && <StatusPill status="review" />}
            <span className="text-[13px]">
              <LiveTaskTime task={t} renderedAt={renderedAt} />
            </span>
            <button
              type="button"
              className={`btn btn-icon ${running ? "btn-warning" : "btn-success"}`}
              onClick={() => (running ? pause() : start(t.id))}
              disabled={pending}
              aria-label={running ? "Pause" : "Démarrer"}
            >
              <Icon icon={running ? faPause : faPlay} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

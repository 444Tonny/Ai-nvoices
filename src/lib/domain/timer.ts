import type { TimerState } from "@/lib/types";
import { must, type DB } from "./core";

/**
 * Le timer est entièrement piloté par des fonctions Postgres atomiques
 * (voir supabase/migrations/*_functions.sql) : il survit au rechargement,
 * aux onglets et aux appareils.
 */
export async function getTimerState(db: DB): Promise<TimerState> {
  const raw = must(await db.rpc("timer_status")) as Partial<TimerState> | null;
  return {
    status: raw?.status ?? "idle",
    task: raw?.task ?? null,
    entry_id: raw?.entry_id ?? null,
    entry_start: raw?.entry_start ?? null,
    accumulated_seconds: Number(raw?.accumulated_seconds ?? 0),
    server_now: raw?.server_now ?? new Date().toISOString(),
  };
}

export async function startTimer(db: DB, taskId: string): Promise<void> {
  must(await db.rpc("timer_start", { p_task_id: taskId }));
}

export async function pauseTimer(db: DB): Promise<void> {
  must(await db.rpc("timer_pause"));
}

export async function resumeTimer(db: DB): Promise<void> {
  must(await db.rpc("timer_resume"));
}

export async function stopTimer(db: DB): Promise<void> {
  must(await db.rpc("timer_stop"));
}

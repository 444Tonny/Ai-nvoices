"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimerState } from "@/lib/types";
import type { RecentTask } from "@/lib/domain/tasks";
import { pauseTimerAction, resumeTimerAction, startTimerAction, stopTimerAction } from "@/actions/timer";
import { useAction } from "@/components/ui/use-action";
import { entrySeconds, formatHMS } from "@/lib/format";

export interface TodayEntry {
  start_time: string;
  end_time: string | null;
}

interface TimerContextValue {
  state: TimerState;
  /** Temps écoulé de la session (accumulé avant pause + entrée courante), en secondes. */
  elapsed: number;
  /** Total du jour (heure locale) en secondes, mis à jour en direct. */
  todaySeconds: number;
  /** Horodatage client courant (rafraîchi chaque seconde). */
  now: number;
  recentTasks: RecentTask[];
  pending: boolean;
  start: (taskId: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  switcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;
}

const Ctx = createContext<TimerContextValue | null>(null);
const CHANNEL = "tim-timer";

/** Horloge partagée : un seul intervalle, rafraîchi chaque seconde. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Somme des secondes des entrées comprises dans la journée locale de `now`. */
function secondsToday(entries: TodayEntry[], now: number): number {
  const today = new Date(now);
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayEnd = dayStart + 86_400_000;
  let total = 0;
  for (const e of entries) {
    const s = Math.max(new Date(e.start_time).getTime(), dayStart);
    const en = Math.min(e.end_time ? new Date(e.end_time).getTime() : now, dayEnd);
    if (en > s) total += (en - s) / 1000;
  }
  return total;
}

export function TimerProvider({
  initialState,
  recentTasks,
  todayEntries,
  children,
}: {
  initialState: TimerState;
  recentTasks: RecentTask[];
  todayEntries: TodayEntry[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const now = useNow();
  const { exec, pending } = useAction();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Décalage entre l'horloge serveur et l'horloge client, pour un affichage juste.
  const skew = useMemo(() => new Date(initialState.server_now).getTime() - Date.now(), [initialState.server_now]);
  const state = initialState;

  // Synchronisation entre fenêtres (mini-timer, autres onglets) et au retour sur l'onglet.
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => router.refresh();
    channelRef.current = ch;
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ch.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const after = useCallback(() => channelRef.current?.postMessage("changed"), []);

  const start = useCallback(
    async (taskId: string) => {
      const res = await exec(() => startTimerAction(taskId));
      if (res.ok) after();
    },
    [exec, after],
  );
  const pause = useCallback(async () => {
    const res = await exec(() => pauseTimerAction());
    if (res.ok) after();
  }, [exec, after]);
  const resume = useCallback(async () => {
    const res = await exec(() => resumeTimerAction());
    if (res.ok) after();
  }, [exec, after]);
  const stop = useCallback(async () => {
    const res = await exec(() => stopTimerAction());
    if (res.ok) after();
  }, [exec, after]);

  const serverNow = now + skew;
  const elapsed =
    state.accumulated_seconds +
    (state.status === "running" && state.entry_start ? entrySeconds(state.entry_start, null, serverNow) : 0);
  const todaySeconds = secondsToday(todayEntries, serverNow);

  // Raccourci clavier ⌘K / Ctrl+K pour la palette de tâches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcherOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Titre de l'onglet = temps écoulé pendant que le timer tourne.
  useEffect(() => {
    if (state.status !== "running") return;
    const base = document.title.replace(/^\d{2,}:\d{2}:\d{2} · /, "");
    document.title = `${formatHMS(elapsed)} · ${base}`;
    return () => {
      document.title = document.title.replace(/^\d{2,}:\d{2}:\d{2} · /, "");
    };
  }, [elapsed, state.status]);

  const value: TimerContextValue = {
    state,
    elapsed,
    todaySeconds,
    now: serverNow,
    recentTasks,
    pending,
    start,
    pause,
    resume,
    stop,
    switcherOpen,
    setSwitcherOpen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTimer doit être utilisé dans TimerProvider");
  return ctx;
}


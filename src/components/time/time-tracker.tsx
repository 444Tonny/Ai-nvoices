"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TimeEntryWithTask } from "@/lib/types";
import { updateEntryAction } from "@/actions/entries";
import { useTimer } from "@/components/timer/timer-provider";
import { useAction } from "@/components/ui/use-action";
import { Modal } from "@/components/ui/modal";
import { ColorDot } from "@/components/ui/pills";
import { EntryList } from "@/components/entries/entry-list";
import { ManualEntryForm, type TaskOption } from "@/components/entries/manual-entry-form";
import { formatHMS, formatHoursMinutes } from "@/lib/format";
import { dateKeyInTz, zonedMidnight } from "@/lib/tz-utils";

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function ymdKey({ y, m, d }: Ymd, offset = 0) {
  const dt = new Date(Date.UTC(y, m, d + offset));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Barre « Sur quoi travaillez-vous ? » : démarrage du timer et note de l'entrée en cours. */
function TimerBar({ tasks }: { tasks: TaskOption[] }) {
  const { state, elapsed, start, stop, pause, resume, pending } = useTimer();
  const { exec } = useAction();
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const running = state.status === "running";

  useEffect(() => setNote(""), [state.entry_id]);

  const grouped = useMemo(() => {
    const map = new Map<string, TaskOption[]>();
    for (const t of tasks) {
      const k = t.project_name ?? "Sans projet";
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [tasks]);

  return (
    <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
      {running || state.status === "paused" ? (
        <>
          <span className="flex min-w-0 items-center gap-2">
            <ColorDot color={state.task?.project_color} />
            <span className="truncate text-[15px]">{state.task?.name}</span>
          </span>
          {running && state.entry_id && (
            <input
              className="input min-w-[200px] flex-1"
              placeholder="Ajouter une note à cette session…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note.trim() && void exec(() => updateEntryAction(state.entry_id!, { description: note }), "Note enregistrée")}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          )}
          <span className={`tabular ml-auto text-[22px] font-semibold ${running ? "text-success" : "text-warning"}`}>{formatHMS(elapsed)}</span>
          {running ? (
            <button type="button" className="btn btn-warning" onClick={pause} disabled={pending}>
              ⏸ Pause
            </button>
          ) : (
            <button type="button" className="btn btn-success" onClick={resume} disabled={pending}>
              ▶ Reprendre
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={stop} disabled={pending}>
            ■ Stop
          </button>
        </>
      ) : (
        <>
          <select className="select min-w-[240px] flex-1" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Tâche">
            <option value="">Sur quoi travaillez-vous ?</option>
            {grouped.map(([project, list]) => (
              <optgroup key={project} label={project}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="tabular text-[22px] font-semibold text-dim">00:00:00</span>
          <button type="button" className="btn btn-success" disabled={!taskId || pending} onClick={() => start(taskId)}>
            ▶ Démarrer
          </button>
        </>
      )}
    </div>
  );
}

export function TimeTracker({ weekStart, entries, tasks }: { weekStart: Ymd; entries: TimeEntryWithTask[]; tasks: TaskOption[] }) {
  const { now, tz } = useTimer();
  const [adding, setAdding] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => ymdKey(weekStart, i));
  const prevWeek = ymdKey(weekStart, -7);
  const nextWeek = ymdKey(weekStart, 7);

  // Durée par jour (entrée découpée aux minuits du fuseau).
  const perDay = new Map<string, number>();
  for (const e of entries) {
    let s = new Date(e.start_time).getTime();
    const end = e.end_time ? new Date(e.end_time).getTime() : now;
    while (s < end) {
      const key = dateKeyInTz(s, tz);
      const [yy, mm, dd] = key.split("-").map(Number);
      const next = zonedMidnight(yy, mm - 1, dd + 1, tz);
      const segEnd = Math.min(end, next > s ? next : end);
      perDay.set(key, (perDay.get(key) ?? 0) + (segEnd - s) / 1000);
      s = segEnd;
    }
  }
  const weekTotal = days.reduce((sum, k) => sum + (perDay.get(k) ?? 0), 0);
  const max = Math.max(...days.map((k) => perDay.get(k) ?? 0), 1);
  const todayKey = dateKeyInTz(now, tz);

  const byDay = days
    .slice()
    .reverse()
    .map((k) => ({ key: k, entries: entries.filter((e) => dateKeyInTz(new Date(e.start_time).getTime(), tz) === k) }))
    .filter((g) => g.entries.length > 0);

  const label = (k: string) => {
    const [yy, mm, dd] = k.split("-").map(Number);
    return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  };

  return (
    <>
      <TimerBar tasks={tasks} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href={`/time?week=${prevWeek}`} className="btn btn-sm">
          ‹ Semaine précédente
        </Link>
        <Link href="/time" className="btn btn-sm">
          Cette semaine
        </Link>
        <Link href={`/time?week=${nextWeek}`} className="btn btn-sm">
          Semaine suivante ›
        </Link>
        <span className="ml-auto text-muted">
          Total de la semaine : <span className="duration text-[16px]">{formatHoursMinutes(weekTotal)}</span>
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          + Saisie manuelle
        </button>
      </div>

      <div className="card mb-8 grid grid-cols-7 gap-2 p-4">
        {days.map((k, i) => {
          const secs = perDay.get(k) ?? 0;
          return (
            <div key={k} className="flex flex-col items-center gap-2" title={`${label(k)} : ${formatHoursMinutes(secs)}`}>
              <div className="flex h-20 w-full items-end justify-center">
                <div
                  className="w-full max-w-[36px] transition-colors duration-150"
                  style={{ height: `${Math.max(secs > 0 ? 4 : 0, (secs / max) * 100)}%`, background: k === todayKey ? "var(--primary)" : "var(--secondary)", borderRadius: "4px 4px 0 0" }}
                />
              </div>
              <span className={`text-[12px] ${k === todayKey ? "text-primary" : "text-muted"}`}>{DAY_NAMES[i].slice(0, 3)}</span>
              <span className="tabular text-[12px] text-text">{secs > 0 ? formatHoursMinutes(secs) : "—"}</span>
            </div>
          );
        })}
      </div>

      {byDay.length === 0 ? (
        <p className="card px-6 py-12 text-center text-muted">Aucun temps cette semaine.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {byDay.map((g) => (
            <section key={g.key}>
              <h2 className="mb-3 flex items-baseline justify-between text-[16px] capitalize">
                {label(g.key)}
                <span className="duration text-[14px] normal-case">{formatHoursMinutes(perDay.get(g.key) ?? 0)}</span>
              </h2>
              <EntryList entries={g.entries} tasks={tasks} showTask showDate={false} />
            </section>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Saisie manuelle">
        <ManualEntryForm tasks={tasks} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Modal>
    </>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TimeEntryWithTask } from "@/lib/types";
import { formatHoursMinutes } from "@/lib/format";
import { dateKeyInTz, zonedMidnight, zonedParts } from "@/lib/tz-utils";
import { Modal } from "@/components/ui/modal";
import { EntryList } from "@/components/entries/entry-list";
import { ManualEntryForm, type TaskOption } from "@/components/entries/manual-entry-form";
import { useTimer } from "@/components/timer/timer-provider";
import { faChevronLeft, faChevronRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface Day {
  year: number;
  month: number;
  day: number;
  key: string;
}

function monthParam(year: number, month: number) {
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Jours de la grille : du lundi précédant le 1er au dimanche suivant la fin du mois (5 ou 6 semaines). */
function buildGrid(year: number, month: number): Day[] {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, month, 1 - offset + i));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    return { year: y, month: m, day, key: `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
  });
}

/** Découpe chaque entrée aux minuits du fuseau et cumule les secondes par jour. */
function totalsByDay(entries: TimeEntryWithTask[], now: number, tz: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    let s = new Date(e.start_time).getTime();
    const end = e.end_time ? new Date(e.end_time).getTime() : now;
    while (s < end) {
      const p = zonedParts(s, tz);
      const nextDay = zonedMidnight(p.year, p.month, p.day + 1, tz);
      const segEnd = Math.min(end, nextDay > s ? nextDay : end);
      const key = dateKeyInTz(s, tz);
      map.set(key, (map.get(key) ?? 0) + (segEnd - s) / 1000);
      s = segEnd;
    }
  }
  return map;
}

export function CalendarView({
  year,
  month,
  entries,
  tasks,
}: {
  year: number;
  month: number;
  entries: TimeEntryWithTask[];
  tasks: TaskOption[];
}) {
  const { now, tz } = useTimer();
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [adding, setAdding] = useState(false);

  const grid = useMemo(() => buildGrid(year, month), [year, month]);
  const totals = totalsByDay(entries, now, tz);
  const todayKey = dateKeyInTz(now, tz);
  const monthTotal = grid.filter((d) => d.month === month).reduce((sum, d) => sum + (totals.get(d.key) ?? 0), 0);

  const dayRange = selectedDay
    ? [zonedMidnight(selectedDay.year, selectedDay.month, selectedDay.day, tz), zonedMidnight(selectedDay.year, selectedDay.month, selectedDay.day + 1, tz)]
    : null;

  const dayEntries = useMemo(() => {
    if (!dayRange) return [];
    const [start, end] = dayRange;
    return entries
      .filter((e) => new Date(e.start_time).getTime() < end && (e.end_time ? new Date(e.end_time).getTime() : now) > start)
      .sort((a, b) => b.start_time.localeCompare(a.start_time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dayRange?.[0], dayRange?.[1], now]);

  const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const selectedTitle = selectedDay
    ? new Date(Date.UTC(selectedDay.year, selectedDay.month, selectedDay.day)).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/calendar?month=${monthParam(year, month - 1)}`} className="btn btn-sm" aria-label="Mois précédent">
            <Icon icon={faChevronLeft} /> Précédent
          </Link>
          <Link href="/calendar" className="btn btn-sm">
            Aujourd&apos;hui
          </Link>
          <Link href={`/calendar?month=${monthParam(year, month + 1)}`} className="btn btn-sm" aria-label="Mois suivant">
            Suivant <Icon icon={faChevronRight} />
          </Link>
        </div>
        <div className="flex items-baseline gap-4">
          <h2 className="text-[22px] capitalize">{title}</h2>
          <span className="text-muted">
            Total : <span className="duration">{formatHoursMinutes(monthTotal)}</span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px] overflow-hidden rounded-ui border border-border bg-surface-1">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d, i) => {
              const inMonth = d.month === month;
              const secs = totals.get(d.key) ?? 0;
              const isToday = d.key === todayKey;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setSelectedDay(d);
                    setAdding(false);
                  }}
                  className={`flex min-h-[96px] flex-col items-start gap-2 border-border p-3 text-left transition-colors duration-150 hover:bg-surface-2 ${
                    i % 7 !== 6 ? "border-r" : ""
                  } ${i < grid.length - 7 ? "border-b" : ""} ${inMonth ? "" : "bg-page/40"}`}
                >
                  <span
                    className={`flex h-7 min-w-7 items-center justify-center rounded-ui px-1.5 text-[13px] ${
                      isToday ? "bg-primary font-semibold text-on-fill" : inMonth ? "text-text" : "text-dim"
                    }`}
                  >
                    {d.day}
                  </span>
                  {secs > 0 && (
                    <span className={`tabular rounded-ui px-2 py-1 text-[13px] ${inMonth ? "bg-secondary/50 text-accent" : "bg-surface-2 text-dim"}`}>
                      {formatHoursMinutes(secs)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Modal open={selectedDay !== null} onClose={() => setSelectedDay(null)} width={760} title={<span className="capitalize">{selectedTitle}</span>}>
        {selectedDay && dayRange && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted">
                Total du jour : <span className="duration">{formatHoursMinutes(totals.get(selectedDay.key) ?? 0)}</span>
              </p>
              {!adding && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                  <Icon icon={faPlus} /> Ajouter une entrée
                </button>
              )}
            </div>
            {adding && (
              <div className="card p-5">
                <ManualEntryForm
                  tasks={tasks}
                  defaultDate={new Date(dayRange[0])}
                  onDone={() => setAdding(false)}
                  onCancel={() => setAdding(false)}
                />
              </div>
            )}
            <EntryList entries={dayEntries} tasks={tasks} showTask showDate={false} />
          </div>
        )}
      </Modal>
    </>
  );
}

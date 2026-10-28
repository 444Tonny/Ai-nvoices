import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listEntriesInRange } from "@/lib/domain/entries";
import { listTaskOptions } from "@/lib/domain/tasks";
import { PageHeader } from "@/components/ui/misc";
import { getUserTimezone } from "@/lib/tz";
import { zonedParts } from "@/lib/tz-utils";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Calendrier" };

function parseMonth(value: string | undefined, tz: string): { year: number; month: number } {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(m[1]), month };
  }
  const now = zonedParts(Date.now(), tz);
  return { year: now.year, month: now.month };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams;
  const { year, month } = parseMonth(monthParam, await getUserTimezone());

  // La grille couvre au plus 6 semaines autour du mois ; on élargit d'un jour
  // de chaque côté pour absorber tous les fuseaux horaires.
  const from = new Date(Date.UTC(year, month, 1) - 8 * 86_400_000).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 1) + 15 * 86_400_000).toISOString();

  const supabase = await createClient();
  const [entries, tasks] = await Promise.all([listEntriesInRange(supabase, from, to), listTaskOptions(supabase)]);

  return (
    <>
      <PageHeader title="Calendrier" subtitle="Heures travaillées par jour. Cliquez sur un jour pour voir ou ajouter des entrées." />
      <CalendarView year={year} month={month} entries={entries} tasks={tasks} />
    </>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listEntriesInRange } from "@/lib/domain/entries";
import { listTaskOptions } from "@/lib/domain/tasks";
import { getUserTimezone } from "@/lib/tz";
import { zonedMidnight, zonedParts } from "@/lib/tz-utils";
import { PageHeader } from "@/components/ui/misc";
import { TimeTracker } from "@/components/time/time-tracker";

export const metadata: Metadata = { title: "Suivi du temps" };

/** Lundi de la semaine demandée (« YYYY-MM-DD ») ou de la semaine courante, dans le fuseau de l'utilisateur. */
function weekStart(param: string | undefined, tz: string): { y: number; m: number; d: number } {
  const match = param?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = match ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) } : zonedParts(Date.now(), tz);
  const weekday = (new Date(Date.UTC(base.year, base.month, base.day)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(base.year, base.month, base.day - weekday));
  return { y: monday.getUTCFullYear(), m: monday.getUTCMonth(), d: monday.getUTCDate() };
}

export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const tz = await getUserTimezone();
  const { y, m, d } = weekStart(week, tz);
  const from = new Date(zonedMidnight(y, m, d, tz)).toISOString();
  const to = new Date(zonedMidnight(y, m, d + 7, tz)).toISOString();

  const supabase = await createClient();
  const [entries, tasks] = await Promise.all([listEntriesInRange(supabase, from, to), listTaskOptions(supabase)]);

  return (
    <>
      <PageHeader title="Suivi du temps" subtitle="Lancez le timer ou saisissez du temps, semaine par semaine." />
      <TimeTracker weekStart={{ y, m, d }} entries={entries} tasks={tasks} />
    </>
  );
}

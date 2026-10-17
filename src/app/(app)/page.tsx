import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats } from "@/lib/domain/stats";
import { statsRangeSchema, type StatsRange } from "@/lib/domain/schemas";
import { getUserTimezone } from "@/lib/tz";
import { formatHoursMinutes } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { BarList } from "@/components/dashboard/bar-list";

const RANGES: { id: StatsRange; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois" },
  { id: "all", label: "Tout" },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams;
  const range = statsRangeSchema.catch("month").parse(params.range);
  const supabase = await createClient();
  const tz = await getUserTimezone();
  const stats = await getDashboardStats(supabase, tz, range);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label.toLowerCase();

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Vue d'ensemble de votre temps de travail" />

      <section className="mb-9 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label="Aujourd'hui" value={formatHoursMinutes(stats.today)} />
        <StatCard label="Cette semaine" value={formatHoursMinutes(stats.week)} hint="Du lundi au dimanche" />
        <StatCard label="Ce mois" value={formatHoursMinutes(stats.month)} />
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Période des graphiques">
        {RANGES.map((r) => (
          <Link key={r.id} href={r.id === "month" ? "/" : `/?range=${r.id}`} className={`btn btn-sm ${r.id === range ? "btn-primary" : ""}`} scroll={false}>
            {r.label}
          </Link>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="card px-6 py-5">
          <h2 className="mb-1 text-[17px]">Heures par client</h2>
          <p className="mb-4 text-[13px] text-dim">Période : {rangeLabel}</p>
          <BarList data={stats.by_client} emptyLabel="Aucune heure enregistrée sur cette période." />
        </div>
        <div className="card px-6 py-5">
          <h2 className="mb-1 text-[17px]">Heures par projet</h2>
          <p className="mb-4 text-[13px] text-dim">Période : {rangeLabel}</p>
          <BarList data={stats.by_project} emptyLabel="Aucune heure enregistrée sur cette période." />
        </div>
      </section>
    </>
  );
}

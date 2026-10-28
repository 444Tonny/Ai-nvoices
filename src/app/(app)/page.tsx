import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats } from "@/lib/domain/stats";
import { listTaskRows } from "@/lib/domain/tasks";
import { listInvoices, listUnbilled } from "@/lib/domain/invoices";
import { statsRangeSchema, type StatsRange } from "@/lib/domain/schemas";
import { getUserTimezone } from "@/lib/tz";
import { dateKeyInTz } from "@/lib/tz-utils";
import { formatHoursMinutes } from "@/lib/format";
import { formatMoney } from "@/lib/currency";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { BarList } from "@/components/dashboard/bar-list";
import { ActiveTasks } from "@/components/dashboard/active-tasks";
import { faArrowRight, faCalendarWeek, faClock, faFileInvoiceDollar, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

const RANGES: { id: StatsRange; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois" },
  { id: "all", label: "Tout" },
];

const sumByCurrency = (rows: { currency: string; amount: number }[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
  return [...m.entries()].map(([c, a]) => formatMoney(a, c)).join(" + ") || formatMoney(0, "EUR");
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams;
  const range = statsRangeSchema.catch("month").parse(params.range);
  const supabase = await createClient();
  const tz = await getUserTimezone();
  const [stats, active, unbilled, invoices] = await Promise.all([
    getDashboardStats(supabase, tz, range),
    listTaskRows(supabase, { statuses: ["in_progress", "review"] }),
    listUnbilled(supabase),
    listInvoices(supabase),
  ]);
  const renderedAt = Date.now();
  const today = dateKeyInTz(Date.now(), tz);
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const overdue = unpaid.filter((i) => i.due_date && i.due_date < today);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label.toLowerCase();

  return (
    <>
      <PageHeader title="Accueil" subtitle="Votre temps, vos tâches en cours et ce qu'il reste à facturer." />

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aujourd'hui" value={formatHoursMinutes(stats.today)} icon={faClock} />
        <StatCard label="Cette semaine" value={formatHoursMinutes(stats.week)} hint="Du lundi au dimanche" icon={faCalendarWeek} />
        <StatCard
          label="À facturer"
          value={sumByCurrency(unbilled)}
          hint={`${formatHoursMinutes(unbilled.reduce((s, c) => s + c.seconds, 0))} de temps non facturé`}
          icon={faHourglassHalf}
          href="/invoices?tab=unbilled"
        />
        <StatCard
          label="En attente de paiement"
          value={sumByCurrency(unpaid.map((i) => ({ currency: i.currency, amount: i.total })))}
          hint={overdue.length > 0 ? `${overdue.length} facture${overdue.length > 1 ? "s" : ""} en retard` : `${unpaid.length} facture${unpaid.length > 1 ? "s" : ""}`}
          hintTone={overdue.length > 0 ? "danger" : "dim"}
          icon={faFileInvoiceDollar}
          href="/invoices?tab=invoices"
        />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="card px-6 py-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px]">Tâches en cours</h2>
            <Link href="/tasks" className="link inline-flex items-center gap-1.5 text-[13px]">
              Toutes les tâches <Icon icon={faArrowRight} />
            </Link>
          </div>
          <ActiveTasks tasks={active} renderedAt={renderedAt} />
        </div>
        <div className="card px-6 py-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px]">À facturer par client</h2>
            <Link href="/invoices?tab=unbilled" className="link inline-flex items-center gap-1.5 text-[13px]">
              Facturer <Icon icon={faArrowRight} />
            </Link>
          </div>
          {unbilled.length === 0 ? (
            <p className="py-8 text-center text-muted">Tout votre temps facturable est facturé.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {unbilled.map((c) => (
                <li key={c.client_id ?? "none"} className="flex items-center justify-between gap-3 rounded-ui px-2 py-2.5 hover:bg-surface-2">
                  <span className="min-w-0 truncate">{c.client_name ?? "Sans client"}</span>
                  <span className="text-[13px] text-muted">{formatHoursMinutes(c.seconds)}</span>
                  <span className="tabular w-28 text-right text-warning">{formatMoney(c.amount, c.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Période des graphiques">
        {RANGES.map((r) => (
          <Link key={r.id} href={r.id === "month" ? "/" : `/?range=${r.id}`} className={`btn btn-sm ${r.id === range ? "btn-primary" : ""}`} scroll={false}>
            {r.label}
          </Link>
        ))}
        <span className="ml-auto text-[13px] text-muted">Ce mois : {formatHoursMinutes(stats.month)}</span>
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

import { must, type DB } from "./core";
import type { StatsRange } from "./schemas";

export interface NamedSeconds {
  name: string;
  seconds: number;
}

export interface DashboardStats {
  today: number;
  week: number;
  month: number;
  by_client: NamedSeconds[];
  by_project: NamedSeconds[];
}

/** Statistiques calculées en SQL dans le fuseau de l'utilisateur. Semaine = lundi → dimanche. */
export async function getDashboardStats(db: DB, tz: string, range: StatsRange): Promise<DashboardStats> {
  const raw = must(await db.rpc("dashboard_stats", { p_tz: tz, p_range: range })) as DashboardStats;
  const norm = (list: NamedSeconds[] | null) => (list ?? []).map((x) => ({ name: x.name, seconds: Number(x.seconds) }));
  return {
    today: Number(raw.today),
    week: Number(raw.week),
    month: Number(raw.month),
    by_client: norm(raw.by_client),
    by_project: norm(raw.by_project),
  };
}

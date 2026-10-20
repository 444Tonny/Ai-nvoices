import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listInvoiceOptions, listInvoices, listUnbilled, nextInvoiceNumber } from "@/lib/domain/invoices";
import { listClients } from "@/lib/domain/clients";
import { listTemplates } from "@/lib/domain/templates";
import { getUserTimezone } from "@/lib/tz";
import { dateKeyInTz, dateToZonedIso, zonedParts } from "@/lib/tz-utils";
import { PageHeader } from "@/components/ui/misc";
import { UnbilledBoard, type PeriodPreset } from "@/components/invoices/unbilled-board";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { formatMoney } from "@/lib/currency";

export const metadata: Metadata = { title: "Facturation" };

function ymd(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Bornes de la période (dates incluses) selon le préréglage. */
function periodBounds(period: PeriodPreset, from: string | undefined, to: string | undefined, tz: string): { from: string | null; to: string | null } {
  const now = zonedParts(Date.now(), tz);
  if (period === "this_month") return { from: ymd(now.year, now.month, 1), to: ymd(now.year, now.month + 1, 0) };
  if (period === "last_month") return { from: ymd(now.year, now.month - 1, 1), to: ymd(now.year, now.month, 0) };
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (period === "custom" && valid(from) && valid(to)) return { from: from!, to: to! };
  return { from: null, to: null };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const tz = await getUserTimezone();
  const period = (["all", "this_month", "last_month", "custom"].includes(params.period ?? "") ? params.period : "all") as PeriodPreset;
  const bounds = periodBounds(period, params.from, params.to, tz);

  const supabase = await createClient();
  const [unbilled, invoices, options, clients, templates, nextNumber] = await Promise.all([
    listUnbilled(supabase, {
      from: bounds.from ? dateToZonedIso(bounds.from, tz) : null,
      to: bounds.to ? dateToZonedIso(bounds.to, tz, 1) : null,
    }),
    listInvoices(supabase),
    listInvoiceOptions(supabase),
    listClients(supabase),
    listTemplates(supabase),
    nextInvoiceNumber(supabase),
  ]);

  const tab = params.tab === "invoices" || (!params.tab && unbilled.length === 0) ? "invoices" : "unbilled";
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const outstanding = new Map<string, number>();
  for (const i of unpaid) outstanding.set(i.currency, (outstanding.get(i.currency) ?? 0) + i.total);

  const tabClass = (active: boolean) =>
    `rounded-ui px-5 py-2 text-[13px] font-semibold uppercase tracking-wider transition-colors duration-150 ${active ? "bg-primary text-on-fill" : "text-muted hover:text-text"}`;

  return (
    <>
      <PageHeader
        title="Facturation"
        subtitle={
          unpaid.length > 0
            ? `En attente de paiement : ${[...outstanding.entries()].map(([c, a]) => formatMoney(a, c)).join(" + ")} sur ${unpaid.length} facture${unpaid.length > 1 ? "s" : ""}`
            : "Toutes vos factures sont réglées."
        }
        actions={
          <Link href="/settings" className="btn btn-sm">
            Profils émetteur
          </Link>
        }
      />
      <div className="mb-6 inline-flex rounded-ui border border-border bg-surface-2 p-1" role="tablist">
        <Link href="/invoices?tab=unbilled" className={tabClass(tab === "unbilled")} role="tab" aria-selected={tab === "unbilled"}>
          À facturer {unbilled.length > 0 ? `(${unbilled.length})` : ""}
        </Link>
        <Link href="/invoices?tab=invoices" className={tabClass(tab === "invoices")} role="tab" aria-selected={tab === "invoices"}>
          Factures ({invoices.length})
        </Link>
      </div>

      {tab === "unbilled" ? (
        <UnbilledBoard clients={unbilled} invoices={options} period={period} from={bounds.from} to={bounds.to} />
      ) : (
        <InvoicesTable
          invoices={invoices}
          clients={clients.map((c) => ({ id: c.id, name: c.name, currency: c.currency }))}
          templates={templates.map((t) => ({ id: t.id, name: t.name, default_footer_text: t.default_footer_text }))}
          nextNumber={nextNumber}
          today={dateKeyInTz(Date.now(), tz)}
        />
      )}
    </>
  );
}

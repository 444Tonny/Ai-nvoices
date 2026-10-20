"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { InvoiceOption, UnbilledClient } from "@/lib/domain/invoices";
import { addUnbilledAction, createInvoiceFromUnbilledAction } from "@/actions/invoices";
import { useAction } from "@/components/ui/use-action";
import { EmptyState } from "@/components/ui/misc";
import { ColorDot } from "@/components/ui/pills";
import { useTimer } from "@/components/timer/timer-provider";
import { formatMoney } from "@/lib/currency";
import { formatDate, formatHoursMinutes } from "@/lib/format";

export type PeriodPreset = "all" | "this_month" | "last_month" | "custom";

/** Temps à facturer, client par client, avec facture en un clic. */
export function UnbilledBoard({
  clients,
  invoices,
  period,
  from,
  to,
}: {
  clients: UnbilledClient[];
  invoices: InvoiceOption[];
  period: PeriodPreset;
  /** Bornes de la période (YYYY-MM-DD, `to` inclus). */
  from: string | null;
  to: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { exec, pending } = useAction();
  const { tz } = useTimer();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  const go = (p: PeriodPreset, f?: string, t?: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", "unbilled");
    q.set("period", p);
    if (p === "custom" && f && t) {
      q.set("from", f);
      q.set("to", t);
    } else {
      q.delete("from");
      q.delete("to");
    }
    router.push(`${pathname}?${q}`, { scroll: false });
  };

  const create = async (clientId: string) => {
    const res = await exec(() => createInvoiceFromUnbilledAction({ client_id: clientId, from, to }), "Facture créée");
    if (res.ok && res.data) router.push(`/invoices/${res.data.invoiceId}`);
  };

  const addTo = async (invoiceId: string, taskIds: string[]) => {
    const res = await exec(() => addUnbilledAction({ invoice_id: invoiceId, task_ids: taskIds }), "Temps ajouté à la facture");
    if (res.ok && res.data) router.push(`/invoices/${res.data.invoiceId}`);
  };

  const totalByCurrency = new Map<string, number>();
  for (const c of clients) totalByCurrency.set(c.currency, (totalByCurrency.get(c.currency) ?? 0) + c.amount);

  const presets: { id: PeriodPreset; label: string }[] = [
    { id: "all", label: "Tout" },
    { id: "this_month", label: "Ce mois" },
    { id: "last_month", label: "Mois dernier" },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button key={p.id} type="button" className={`btn btn-sm ${period === p.id ? "btn-primary" : ""}`} onClick={() => go(p.id)}>
            {p.label}
          </button>
        ))}
        <span className="mx-1 text-dim">|</span>
        <input type="date" className="input max-w-[170px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Du" />
        <span className="text-muted">au</span>
        <input type="date" className="input max-w-[170px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Au" />
        <button type="button" className={`btn btn-sm ${period === "custom" ? "btn-primary" : ""}`} disabled={!customFrom || !customTo} onClick={() => go("custom", customFrom, customTo)}>
          Appliquer
        </button>
        {clients.length > 0 && (
          <span className="ml-auto text-muted">
            Total à facturer :{" "}
            <span className="tabular text-[16px] text-warning">{[...totalByCurrency.entries()].map(([cur, amount]) => formatMoney(amount, cur)).join(" + ")}</span>
          </span>
        )}
      </div>

      {clients.length === 0 ? (
        <EmptyState title="Tout est facturé" hint="Le temps facturable non encore facturé apparaîtra ici, regroupé par client." />
      ) : (
        <div className="flex flex-col gap-5">
          {clients.map((c) => {
            const key = c.client_id ?? "none";
            const expanded = open[key] ?? clients.length === 1;
            const taskIds = c.projects.flatMap((p) => p.tasks.map((t) => t.task_id));
            const existing = invoices.filter((i) => i.client_id === c.client_id);
            return (
              <section key={key} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-4 px-6 py-5">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen((o) => ({ ...o, [key]: !expanded }))}>
                    <span className="w-3 text-dim">{expanded ? "▾" : "▸"}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[18px]">{c.client_name ?? "Sans client"}</span>
                      <span className="block text-[13px] text-muted">
                        {formatHoursMinutes(c.seconds)} · du {formatDate(c.first_entry, tz)} au {formatDate(c.last_entry, tz)}
                      </span>
                    </span>
                  </button>
                  <span className="tabular text-[22px] font-semibold text-warning">{formatMoney(c.amount, c.currency)}</span>
                  <div className="flex flex-wrap gap-2">
                    {c.client_id ? (
                      <button type="button" className="btn btn-primary" onClick={() => create(c.client_id!)} disabled={pending}>
                        Créer la facture
                      </button>
                    ) : (
                      <span className="text-[13px] text-muted">Rattachez ces projets à un client pour les facturer.</span>
                    )}
                    {existing.length > 0 && (
                      <select
                        className="select max-w-[220px]"
                        value=""
                        onChange={(e) => e.target.value && addTo(e.target.value, taskIds)}
                        disabled={pending}
                        aria-label="Ajouter à une facture existante"
                      >
                        <option value="">Ajouter à…</option>
                        {existing.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.number}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-border">
                    {c.projects.map((p) => (
                      <div key={p.project_id ?? "none"} className="border-b border-border last:border-b-0">
                        <div className="flex items-center gap-3 bg-surface-2 px-6 py-2.5">
                          <ColorDot color={p.project_color} />
                          {p.project_id ? (
                            <Link href={`/projects/${p.project_id}`} className="link text-[14px]">
                              {p.project_name}
                            </Link>
                          ) : (
                            <span className="text-[14px] text-muted">Sans projet</span>
                          )}
                          <span className="ml-auto text-[13px] text-muted">{formatHoursMinutes(p.seconds)}</span>
                          <span className="tabular w-28 text-right text-[14px]">{formatMoney(p.amount, c.currency)}</span>
                        </div>
                        {p.tasks.map((t) => (
                          <div key={t.task_id} className="flex items-center gap-3 px-6 py-2.5 pl-12 text-[14px]">
                            <Link href={`/tasks/${t.task_id}`} className="min-w-0 flex-1 truncate hover:text-primary" title={t.task_name}>
                              {t.task_name}
                            </Link>
                            <span className="text-[12px] text-dim">
                              {t.entries} entrée{t.entries > 1 ? "s" : ""}
                            </span>
                            <span className="duration w-20 text-right text-[13px]">{formatHoursMinutes(t.seconds)}</span>
                            <span className="tabular w-28 text-right text-muted">{formatMoney(t.amount, c.currency)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

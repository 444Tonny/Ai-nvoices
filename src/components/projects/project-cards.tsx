"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectSummary } from "@/lib/types";
import { formatMoney, formatRate } from "@/lib/currency";
import { formatHoursMinutes } from "@/lib/format";
import { TASK_STATUS, TASK_STATUSES } from "@/lib/labels";
import { EmptyState } from "@/components/ui/misc";
import { ProjectFormModal, type ClientOption } from "./project-form";

/** Barre de progression empilée : tâches par statut. */
export function TaskProgress({ counts }: { counts: ProjectSummary["task_counts"] }) {
  const total = TASK_STATUSES.reduce((s, k) => s + counts[k], 0);
  if (total === 0) return <div className="h-1.5 rounded-ui bg-surface-3" />;
  return (
    <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-ui" title={TASK_STATUSES.map((s) => `${TASK_STATUS[s].label} : ${counts[s]}`).join(" · ")}>
      {TASK_STATUSES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: TASK_STATUS[s].color }} />
      ))}
    </div>
  );
}

export function ProjectCards({ projects, clients, defaultClientId }: { projects: ProjectSummary[]; clients: ClientOption[]; defaultClientId?: string }) {
  const [creating, setCreating] = useState(false);
  const newButton = (
    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
      + Nouveau projet
    </button>
  );

  return (
    <>
      <div className="mb-5 flex justify-end">{newButton}</div>
      {projects.length === 0 ? (
        <EmptyState title="Aucun projet" hint="Un projet regroupe des tâches, avec un client et un taux horaire." action={newButton} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {projects.map((p) => {
            const total = TASK_STATUSES.reduce((s, k) => s + p.task_counts[k], 0);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={`card flex flex-col gap-4 p-5 transition-colors duration-150 hover:border-primary/60 ${p.archived ? "opacity-60" : ""}`}
                style={{ boxShadow: `inset 4px 0 0 ${p.color}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[17px]" title={p.name}>
                      {p.name}
                    </h3>
                    <p className="truncate text-[13px] text-muted">{p.client?.name ?? "Sans client"}</p>
                  </div>
                  {p.archived ? (
                    <span className="badge bg-surface-3 text-muted">Archivé</span>
                  ) : !p.billable ? (
                    <span className="badge bg-surface-3 text-muted">Non facturable</span>
                  ) : (
                    <span className="whitespace-nowrap text-[13px] text-muted">{formatRate(p.rate, p.currency)}</span>
                  )}
                </div>
                <div>
                  <TaskProgress counts={p.task_counts} />
                  <p className="mt-1.5 text-[12px] text-muted">
                    {p.task_counts.done}/{total} tâche{total > 1 ? "s" : ""} terminée{p.task_counts.done > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-dim">Temps total</p>
                    <p className="duration text-[15px]">{formatHoursMinutes(p.total_seconds)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wider text-dim">À facturer</p>
                    <p className={`tabular text-[15px] ${p.unbilled_amount > 0 ? "text-warning" : "text-dim"}`}>{formatMoney(p.unbilled_amount, p.currency)}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <ProjectFormModal open={creating} onClose={() => setCreating(false)} clients={clients} defaultClientId={defaultClientId} />
    </>
  );
}

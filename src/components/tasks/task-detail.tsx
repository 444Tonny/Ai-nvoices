"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TaskRow, TimeEntryWithTask } from "@/lib/types";
import type { InvoiceOption } from "@/lib/domain/invoices";
import { deleteTasksAction, updateTaskAction } from "@/actions/catalog";
import { useTimer } from "@/components/timer/timer-provider";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { Menu } from "@/components/ui/menu";
import { ColorDot, PrioritySelect, StatusSelect } from "@/components/ui/pills";
import { EntryList } from "@/components/entries/entry-list";
import { ManualEntryForm, type TaskOption } from "@/components/entries/manual-entry-form";
import { formatHoursMinutes } from "@/lib/format";
import { LiveTaskTime } from "./tasks-view";
import { BillTasksModal } from "./bill-tasks-modal";
import type { ProjectOption } from "./task-form";
import { faFileInvoiceDollar, faPause, faPlay, faPlus } from "@fortawesome/free-solid-svg-icons";
import { faTrello } from "@fortawesome/free-brands-svg-icons";
import { Icon } from "@/components/ui/icon";

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="text-[12px] uppercase tracking-wider text-muted">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

/** Vue d'une tâche façon ClickUp : contenu à gauche, propriétés éditables à droite. */
export function TaskDetail({
  task,
  entries,
  projects,
  invoices,
  taskOptions,
  renderedAt,
}: {
  task: TaskRow;
  entries: TimeEntryWithTask[];
  projects: ProjectOption[];
  invoices: InvoiceOption[];
  taskOptions: TaskOption[];
  renderedAt: number;
}) {
  const router = useRouter();
  const { state, start, pause, pending: timerPending } = useTimer();
  const { exec } = useAction();
  const { confirm } = useFeedback();
  const [t, setT] = useState(task);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? "");
  const [estimate, setEstimate] = useState(task.estimate_minutes ? String(task.estimate_minutes / 60).replace(".", ",") : "");
  const [adding, setAdding] = useState(false);
  const [billing, setBilling] = useState(false);

  useEffect(() => {
    setT(task);
    setName(task.name);
    setDescription(task.description ?? "");
    setEstimate(task.estimate_minutes ? String(task.estimate_minutes / 60).replace(".", ",") : "");
  }, [task]);

  const running = state.status === "running" && state.task?.id === t.id;
  const save = (patch: Record<string, unknown>) => {
    setT((cur) => ({ ...cur, ...(patch as Partial<TaskRow>) }));
    return exec(() => updateTaskAction(t.id, patch));
  };

  const saveEstimate = () => {
    const hours = Number(estimate.replace(",", "."));
    const minutes = estimate.trim() === "" ? null : Number.isFinite(hours) ? Math.round(hours * 60) : t.estimate_minutes;
    if (minutes !== t.estimate_minutes) void save({ estimate_minutes: minutes });
  };

  const remove = async () => {
    if (!(await confirm(`Supprimer la tâche « ${t.name} » et tout son historique de temps ?`))) return;
    const res = await exec(() => deleteTasksAction([t.id]), "Tâche supprimée");
    if (res.ok) router.push(t.project ? `/projects/${t.project.id}` : "/tasks");
  };

  const progress = t.estimate_minutes ? Math.min(100, (t.total_seconds / 60 / t.estimate_minutes) * 100) : null;
  const project = projects.find((p) => p.id === t.project_id);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
          {t.project ? (
            <Link href={`/projects/${t.project.id}`} className="inline-flex items-center gap-2 hover:text-text">
              <ColorDot color={t.project.color} /> {t.project.name}
            </Link>
          ) : (
            <span>Sans projet</span>
          )}
          {t.client && (
            <>
              <span className="text-dim">/</span>
              <Link href={`/clients/${t.client.id}`} className="hover:text-text">
                {t.client.name}
              </Link>
            </>
          )}
          {t.external_url && (
            <a href={t.external_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 hover:text-text" title="Ouvrir la carte d'origine">
              <Icon icon={faTrello} className="text-[#0C66E4]" /> Ouvrir dans Trello
            </a>
          )}
        </div>
        <input
          className="mb-5 w-full rounded-ui border border-transparent bg-transparent px-2 py-1 text-[26px] font-semibold text-text transition-colors duration-150 hover:border-border focus:border-primary focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== t.name && void save({ name: name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Nom de la tâche"
        />

        <div className="mb-8 flex flex-wrap gap-3">
          <button type="button" className={`btn ${running ? "btn-warning" : "btn-success"}`} onClick={() => (running ? pause() : start(t.id))} disabled={timerPending}>
            <Icon icon={running ? faPause : faPlay} />
            {running ? "Pause" : "Démarrer le timer"}
          </button>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon icon={faPlus} /> Ajouter du temps
          </button>
          <button type="button" className="btn" onClick={() => setBilling(true)} disabled={t.unbilled_seconds === 0}>
            <Icon icon={faFileInvoiceDollar} /> Facturer {t.unbilled_seconds > 0 ? formatHoursMinutes(t.unbilled_seconds) : ""}
          </button>
        </div>

        <section className="mb-9">
          <h2 className="label mb-2">Description</h2>
          <textarea
            className="textarea min-h-[120px]"
            placeholder="Ajoutez des détails, des liens, une checklist…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (t.description ?? "") && void save({ description })}
          />
        </section>

        <section>
          <h2 className="mb-4 text-[18px]">Entrées de temps</h2>
          <EntryList entries={entries} tasks={taskOptions} />
        </section>
      </div>

      <aside className="card h-fit px-5 py-3 xl:sticky xl:top-24">
        <Property label="Statut">
          <StatusSelect status={t.status} onChange={(s) => void save({ status: s })} />
        </Property>
        <Property label="Priorité">
          <PrioritySelect priority={t.priority} onChange={(p) => void save({ priority: p })} showLabel />
        </Property>
        <Property label="Projet">
          <Menu
            trigger={
              <span className="inline-flex max-w-[190px] items-center gap-2 px-1.5 py-1 text-[13px]">
                {project ? (
                  <>
                    <ColorDot color={project.color} />
                    <span className="truncate">{project.name}</span>
                  </>
                ) : (
                  <span className="text-dim">Aucun</span>
                )}
              </span>
            }
            value={t.project_id ?? "none"}
            onSelect={(v) => void save({ project_id: v === "none" ? null : v }).then(() => router.refresh())}
            items={[{ value: "none", label: "Sans projet" }, ...projects.map((p) => ({ value: p.id, label: p.name, color: p.color }))]}
          />
        </Property>
        <Property label="Échéance">
          <input
            type="date"
            className="input max-w-[170px] py-1.5"
            style={{ minHeight: 32 }}
            value={t.due_date ?? ""}
            onChange={(e) => void save({ due_date: e.target.value || null })}
            aria-label="Échéance"
          />
        </Property>
        <Property label="Estimation">
          <span className="flex items-center gap-2">
            <input
              className="input w-20 py-1.5 text-right"
              style={{ minHeight: 32 }}
              inputMode="decimal"
              placeholder="—"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={saveEstimate}
              aria-label="Estimation en heures"
            />
            <span className="text-[13px] text-muted">h</span>
          </span>
        </Property>
        <Property label="Temps passé">
          <span className="text-[15px]">
            <LiveTaskTime task={t} renderedAt={renderedAt} />
          </span>
        </Property>
        {progress !== null && (
          <div className="border-b border-border py-3">
            <div className="h-1.5 overflow-hidden rounded-ui bg-surface-3">
              <div className="h-full" style={{ width: `${progress}%`, background: progress >= 100 ? "var(--danger)" : "var(--primary)" }} />
            </div>
            <p className="mt-1.5 text-right text-[12px] text-muted">{Math.round(progress)} % de l&apos;estimation</p>
          </div>
        )}
        <Property label="Facturé">
          <span className="text-[13px] text-success">{formatHoursMinutes(t.billed_seconds)}</span>
        </Property>
        <Property label="À facturer">
          <span className={`text-[13px] ${t.unbilled_seconds > 0 ? "text-warning" : "text-dim"}`}>{formatHoursMinutes(t.unbilled_seconds)}</span>
        </Property>
        <div className="pt-4 pb-2">
          <button type="button" className="btn btn-sm btn-danger w-full" onClick={remove}>
            Supprimer la tâche
          </button>
        </div>
      </aside>

      <Modal open={adding} onClose={() => setAdding(false)} title={`Ajouter du temps · ${t.name}`}>
        <ManualEntryForm taskId={t.id} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Modal>
      <BillTasksModal tasks={billing ? [t] : []} invoices={invoices} onClose={() => setBilling(false)} />
    </div>
  );
}

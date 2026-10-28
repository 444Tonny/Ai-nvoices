"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TaskPriority, TaskRow, TaskStatus } from "@/lib/types";
import type { InvoiceOption } from "@/lib/domain/invoices";
import { createTaskAction, deleteTasksAction, moveTaskAction, updateTaskAction } from "@/actions/catalog";
import { useAction } from "@/components/ui/use-action";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection, type Selection } from "@/components/ui/selection";
import { Menu } from "@/components/ui/menu";
import { ColorDot, DueDate, PrioritySelect, StatusPill, StatusSelect } from "@/components/ui/pills";
import { EmptyState } from "@/components/ui/misc";
import { useTimer } from "@/components/timer/timer-provider";
import { TASK_STATUS, TASK_STATUSES } from "@/lib/labels";
import { formatHMS, formatHoursMinutes } from "@/lib/format";
import { NewTaskModal, type ProjectOption } from "./task-form";
import { BillTasksModal } from "./bill-tasks-modal";
import { faChevronDown, faChevronRight, faFileInvoiceDollar, faList, faMagnifyingGlass, faPause, faPlay, faPlus, faTableColumns } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

type View = "list" | "board";

/** Temps total d'une tâche, actualisé en direct si elle est en cours. */
export function LiveTaskTime({ task, renderedAt }: { task: Pick<TaskRow, "total_seconds" | "is_running">; renderedAt: number }) {
  const { now } = useTimer();
  const secs = task.total_seconds + (task.is_running ? Math.max(0, (now - renderedAt) / 1000) : 0);
  return <span className="duration tabular">{formatHMS(secs)}</span>;
}

/** Bouton lecture / pause d'une tâche. */
function TimerToggle({ task }: { task: TaskRow }) {
  const { state, start, pause, pending } = useTimer();
  const running = state.status === "running" && state.task?.id === task.id;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void (running ? pause() : start(task.id));
      }}
      disabled={pending}
      className={`btn btn-icon ${running ? "btn-warning" : ""}`}
      title={running ? "Mettre en pause" : "Démarrer le timer"}
      aria-label={running ? "Mettre en pause" : "Démarrer le timer"}
    >
      <Icon icon={running ? faPause : faPlay} />
    </button>
  );
}

/** Mutations communes (optimistes côté appelant). */
function useTaskMutations() {
  const { exec } = useAction();
  return {
    update: (id: string, patch: Record<string, unknown>) => exec(() => updateTaskAction(id, patch)),
    move: (id: string, status: TaskStatus, position: number) => exec(() => moveTaskAction(id, status, position)),
    create: (input: Record<string, unknown>) => exec(() => createTaskAction(input)),
  };
}

/** Échéance éditable : clic → sélecteur de date natif. */
function DueDateEdit({ task, onChange }: { task: TaskRow; onChange: (date: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="relative inline-flex items-center">
      <button type="button" className="rounded-ui px-1.5 py-1 hover:bg-surface-3" onClick={() => ref.current?.showPicker?.() ?? ref.current?.focus()}>
        <DueDate date={task.due_date} done={task.status === "done"} />
      </button>
      <input
        ref={ref}
        type="date"
        className="pointer-events-none absolute inset-0 opacity-0"
        tabIndex={-1}
        value={task.due_date ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Échéance"
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ajout rapide
// ---------------------------------------------------------------------------
function QuickAdd({ status, projectId, onCreated }: { status: TaskStatus; projectId?: string | null; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { create } = useTaskMutations();

  if (!open) {
    return (
      <button type="button" className="w-full rounded-ui px-4 py-3 text-left text-[13px] text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-muted" onClick={() => setOpen(true)}>
        <Icon icon={faPlus} /> Ajouter une tâche
      </button>
    );
  }
  const submit = async () => {
    const value = name.trim();
    if (!value) return setOpen(false);
    setName("");
    const res = await create({ name: value, status, project_id: projectId ?? null });
    if (res.ok) onCreated?.();
  };
  return (
    <div className="flex gap-2 px-2 py-2">
      <input
        className="input"
        autoFocus
        placeholder="Nom de la tâche, puis Entrée"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => !name.trim() && setOpen(false)}
      />
      <button type="button" className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
        Ajouter
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vue liste (groupée par statut)
// ---------------------------------------------------------------------------
function TaskListView({
  tasks,
  setTasks,
  selection,
  showProject,
  defaultProjectId,
  renderedAt,
}: {
  tasks: TaskRow[];
  setTasks: React.Dispatch<React.SetStateAction<TaskRow[]>>;
  selection: Selection;
  showProject: boolean;
  defaultProjectId?: string | null;
  renderedAt: number;
}) {
  const { update } = useTaskMutations();
  const [collapsed, setCollapsed] = useState<Record<TaskStatus, boolean>>({ todo: false, in_progress: false, review: false, done: true });
  const { state } = useTimer();

  const patch = (id: string, p: Partial<TaskRow>) => {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
    void update(id, p as Record<string, unknown>);
  };

  return (
    <div className="flex flex-col gap-5">
      {TASK_STATUSES.map((status) => {
        const group = tasks.filter((t) => t.status === status);
        const secs = group.reduce((s, t) => s + t.total_seconds, 0);
        return (
          <section key={status} className="overflow-hidden rounded-ui border border-border bg-surface-1">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
              className="flex w-full items-center gap-3 border-b border-border bg-surface-2 px-4 py-3 text-left"
              style={{ boxShadow: `inset 3px 0 0 ${TASK_STATUS[status].color}` }}
            >
              <Icon icon={faChevronRight} className={`w-3 text-dim transition-transform duration-150 ${collapsed[status] ? "" : "rotate-90"}`} />
              <StatusPill status={status} />
              <span className="text-[13px] text-muted">{group.length}</span>
              {secs > 0 && <span className="ml-auto text-[13px] text-muted">{formatHoursMinutes(secs)}</span>}
            </button>
            {!collapsed[status] && (
              <>
                {group.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="w-10">
                            <span className="sr-only">Sélection</span>
                          </th>
                          <th>Tâche</th>
                          {showProject && <th>Projet</th>}
                          <th className="w-24">Priorité</th>
                          <th className="w-28">Échéance</th>
                          <th className="w-36 text-right">Temps</th>
                          <th className="w-28 text-right">Statut</th>
                          <th className="w-14" />
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((t) => {
                          const running = state.status === "running" && state.task?.id === t.id;
                          return (
                            <tr key={t.id} className={selection.has(t.id) ? "row-selected" : running ? "row-active" : ""}>
                              <td>
                                <RowCheckbox selection={selection} id={t.id} />
                              </td>
                              <td className="min-w-[220px]">
                                <Link href={`/tasks/${t.id}`} className={`link truncate-cell ${t.status === "done" ? "line-through opacity-70" : ""}`} style={{ maxWidth: 420 }} title={t.name}>
                                  {t.name}
                                </Link>
                              </td>
                              {showProject && (
                                <td className="min-w-[160px]">
                                  {t.project ? (
                                    <Link href={`/projects/${t.project.id}`} className="inline-flex max-w-[220px] items-center gap-2 text-[13px] text-muted hover:text-text" title={t.project.name}>
                                      <ColorDot color={t.project.color} />
                                      <span className="truncate">{t.project.name}</span>
                                    </Link>
                                  ) : (
                                    <span className="text-dim">—</span>
                                  )}
                                </td>
                              )}
                              <td>
                                <PrioritySelect priority={t.priority} onChange={(p: TaskPriority | null) => patch(t.id, { priority: p })} />
                              </td>
                              <td>
                                <DueDateEdit task={t} onChange={(d) => patch(t.id, { due_date: d })} />
                              </td>
                              <td className="text-right">
                                <LiveTaskTime task={t} renderedAt={renderedAt} />
                                {t.unbilled_seconds > 0 && (
                                  <span className="block text-[11px] text-warning" title="Temps non facturé">
                                    {formatHoursMinutes(t.unbilled_seconds)} à facturer
                                  </span>
                                )}
                              </td>
                              <td className="text-right">
                                <StatusSelect status={t.status} onChange={(s) => patch(t.id, { status: s })} />
                              </td>
                              <td className="text-right">
                                <TimerToggle task={t} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <QuickAdd status={status} projectId={defaultProjectId} />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vue tableau (Kanban, glisser-déposer)
// ---------------------------------------------------------------------------
function TaskBoardView({
  tasks,
  setTasks,
  showProject,
  defaultProjectId,
  renderedAt,
}: {
  tasks: TaskRow[];
  setTasks: React.Dispatch<React.SetStateAction<TaskRow[]>>;
  showProject: boolean;
  defaultProjectId?: string | null;
  renderedAt: number;
}) {
  const { move } = useTaskMutations();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TaskStatus; index: number } | null>(null);
  const { state } = useTimer();

  const columns = useMemo(
    () => Object.fromEntries(TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position)])) as Record<TaskStatus, TaskRow[]>,
    [tasks],
  );

  const drop = (status: TaskStatus, index: number) => {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (!id) return;
    const col = columns[status].filter((t) => t.id !== id);
    const prev = col[index - 1]?.position;
    const next = col[index]?.position;
    const position =
      prev === undefined && next === undefined ? Date.now() / 1000 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    const current = tasks.find((t) => t.id === id);
    if (current && current.status === status && current.position === position) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status, position } : t)));
    void move(id, status, position);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-3">
      {TASK_STATUSES.map((status) => {
        const col = columns[status];
        return (
          <section
            key={status}
            className={`flex w-[290px] shrink-0 flex-col rounded-ui border bg-surface-1 ${over?.status === status ? "border-primary" : "border-border"}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (over?.status !== status) setOver({ status, index: col.length });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(status, over?.status === status ? over.index : col.length);
            }}
          >
            <header className="flex items-center gap-2 border-b border-border px-3 py-3" style={{ boxShadow: `inset 0 3px 0 ${TASK_STATUS[status].color}` }}>
              <StatusPill status={status} />
              <span className="text-[13px] text-muted">{col.length}</span>
            </header>
            <div className="flex min-h-[80px] flex-col gap-2 p-2">
              {col.map((t, i) => {
                const running = state.status === "running" && state.task?.id === t.id;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                      if (over?.status !== status || over.index !== index) setOver({ status, index });
                    }}
                    className={`cursor-grab rounded-ui border bg-surface-2 p-3 transition-colors duration-150 hover:border-primary/60 active:cursor-grabbing ${
                      dragId === t.id ? "opacity-40" : ""
                    } ${running ? "border-success/70" : "border-border"} ${over?.status === status && over.index === i && dragId !== t.id ? "shadow-[0_-2px_0_var(--primary)]" : ""}`}
                  >
                    <Link href={`/tasks/${t.id}`} className={`block text-[14px] leading-snug hover:text-primary ${t.status === "done" ? "line-through opacity-70" : ""}`}>
                      {t.name}
                    </Link>
                    {showProject && t.project && (
                      <span className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
                        <ColorDot color={t.project.color} size={8} />
                        <span className="truncate">{t.project.name}</span>
                      </span>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      {t.priority && <PrioritySelectStatic task={t} />}
                      {t.due_date && <DueDate date={t.due_date} done={t.status === "done"} />}
                      <span className="ml-auto text-[12px]">
                        <LiveTaskTime task={t} renderedAt={renderedAt} />
                      </span>
                      <TimerToggle task={t} />
                    </div>
                    {t.unbilled_seconds > 0 && <p className="mt-1.5 text-right text-[11px] text-warning">{formatHoursMinutes(t.unbilled_seconds)} à facturer</p>}
                  </div>
                );
              })}
              {over?.status === status && over.index === col.length && dragId && <div className="h-1 rounded-ui bg-primary" />}
            </div>
            <QuickAdd status={status} projectId={defaultProjectId} />
          </section>
        );
      })}
    </div>
  );
}

function PrioritySelectStatic({ task }: { task: TaskRow }) {
  const { update } = useTaskMutations();
  return <PrioritySelect priority={task.priority} onChange={(p) => void update(task.id, { priority: p })} />;
}

// ---------------------------------------------------------------------------
// Conteneur : barre d'outils, filtres, sélection
// ---------------------------------------------------------------------------
export function TasksView({
  tasks: initialTasks,
  projects,
  invoices,
  renderedAt,
  defaultProjectId,
  showProjectFilter = true,
}: {
  tasks: TaskRow[];
  projects: ProjectOption[];
  invoices: InvoiceOption[];
  renderedAt: number;
  /** Projet imposé (page d'un projet) : pré-lie les nouvelles tâches et masque la colonne Projet. */
  defaultProjectId?: string;
  showProjectFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: View = params.get("view") === "board" ? "board" : "list";
  const { exec, pending } = useAction();

  const [tasks, setTasks] = useState(initialTasks);
  useEffect(() => setTasks(initialTasks), [initialTasks]);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [billing, setBilling] = useState<TaskRow[]>([]);

  const visible = tasks.filter((t) => {
    if (search && !`${t.name} ${t.project?.name ?? ""} ${t.client?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (projectFilter === "none" && t.project) return false;
    if (projectFilter !== "all" && projectFilter !== "none" && t.project?.id !== projectFilter) return false;
    return true;
  });
  const selection = useSelection(visible.map((t) => t.id));

  const setView = (v: View) => {
    const q = new URLSearchParams(params.toString());
    if (v === "board") q.set("view", "board");
    else q.delete("view");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };

  const remove = async (ids: string[]) => (await exec(() => deleteTasksAction(ids), "Tâches supprimées")).ok;

  const bulkStatus = async (status: TaskStatus) => {
    const ids = selection.ids;
    setTasks((ts) => ts.map((t) => (ids.includes(t.id) ? { ...t, status } : t)));
    await Promise.all(ids.map((id) => exec(() => updateTaskAction(id, { status }))));
    selection.clear();
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-ui border border-border bg-surface-2 p-1" role="tablist" aria-label="Vue">
          {(["list", "board"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`inline-flex items-center gap-2 rounded-ui px-4 py-1.5 text-[13px] font-semibold uppercase tracking-wider transition-colors duration-150 ${view === v ? "bg-primary text-on-fill" : "text-muted hover:text-text"}`}
            >
              <Icon icon={v === "list" ? faList : faTableColumns} />
              {v === "list" ? "Liste" : "Tableau"}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-[260px]">
          <Icon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="input pl-10" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher une tâche" />
        </div>
        {showProjectFilter && (
          <select className="select max-w-[240px]" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filtrer par projet">
            <option value="all">Tous les projets</option>
            <option value="none">Sans projet</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-primary ml-auto" onClick={() => setCreating(true)}>
          <Icon icon={faPlus} /> Nouvelle tâche
        </button>
      </div>

      {view === "list" && tasks.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <BulkBar selection={selection} onDelete={remove} noun="tâche" disabled={pending}>
            <Menu<TaskStatus>
              trigger={<span className={`btn btn-sm ${selection.count === 0 ? "pointer-events-none opacity-50" : ""}`}>Changer le statut <Icon icon={faChevronDown} /></span>}
              items={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS[s].label, color: TASK_STATUS[s].color }))}
              onSelect={bulkStatus}
              disabled={selection.count === 0}
            />
            <button type="button" className="btn btn-sm" disabled={selection.count === 0} onClick={() => setBilling(tasks.filter((t) => selection.has(t.id)))}>
              <Icon icon={faFileInvoiceDollar} /> Facturer la sélection
            </button>
          </BulkBar>
          <span className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            <SelectAllCheckbox selection={selection} /> Tout sélectionner
          </span>
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState
          title="Aucune tâche"
          hint="Créez une tâche, puis lancez le timer pour suivre votre temps."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon icon={faPlus} /> Nouvelle tâche
            </button>
          }
        />
      ) : view === "list" ? (
        <TaskListView tasks={visible} setTasks={setTasks} selection={selection} showProject={!defaultProjectId} defaultProjectId={defaultProjectId} renderedAt={renderedAt} />
      ) : (
        <TaskBoardView tasks={visible} setTasks={setTasks} showProject={!defaultProjectId} defaultProjectId={defaultProjectId} renderedAt={renderedAt} />
      )}

      <NewTaskModal open={creating} onClose={() => setCreating(false)} projects={projects} defaultProjectId={defaultProjectId} />
      <BillTasksModal tasks={billing} invoices={invoices} onClose={() => setBilling([])} onDone={selection.clear} />
      {pending && <span className="sr-only">Enregistrement…</span>}
    </>
  );
}

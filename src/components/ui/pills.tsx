"use client";

import { Menu } from "./menu";
import { TASK_PRIORITIES, TASK_PRIORITY, TASK_STATUS, TASK_STATUSES } from "@/lib/labels";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { faFlag } from "@fortawesome/free-solid-svg-icons";
import { faFlag as faFlagOutline } from "@fortawesome/free-regular-svg-icons";
import { Icon } from "@/components/ui/icon";

export function ColorDot({ color, size = 10 }: { color: string | null | undefined; size?: number }) {
  return <span className="inline-block shrink-0 rounded-ui" style={{ width: size, height: size, background: color ?? "var(--dim)" }} aria-hidden />;
}

/** Pastille de statut (lecture seule). */
export function StatusPill({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-ui px-2 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: s.color, background: `${s.color}22` }}>
      <span className="h-2 w-2 rounded-ui" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

/** Statut modifiable en un clic. */
export function StatusSelect({ status, onChange, disabled }: { status: TaskStatus; onChange: (s: TaskStatus) => void; disabled?: boolean }) {
  return (
    <Menu
      trigger={<StatusPill status={status} />}
      value={status}
      disabled={disabled}
      onSelect={onChange}
      items={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS[s].label, color: TASK_STATUS[s].color }))}
    />
  );
}

export function PriorityFlag({ priority, showLabel = false }: { priority: TaskPriority | null; showLabel?: boolean }) {
  if (!priority) return <span className="px-1.5 text-[13px] text-dim">{showLabel ? "Aucune" : <Icon icon={faFlagOutline} />}</span>;
  const p = TASK_PRIORITY[priority];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-1.5 text-[13px]" style={{ color: p.color }} title={`Priorité ${p.label.toLowerCase()}`}>
      <Icon icon={faFlag} />
      {showLabel && <span>{p.label}</span>}
    </span>
  );
}

export function PrioritySelect({
  priority,
  onChange,
  showLabel,
  disabled,
}: {
  priority: TaskPriority | null;
  onChange: (p: TaskPriority | null) => void;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <Menu<TaskPriority | "none">
      trigger={<PriorityFlag priority={priority} showLabel={showLabel} />}
      value={priority ?? "none"}
      disabled={disabled}
      onSelect={(v) => onChange(v === "none" ? null : v)}
      items={[
        ...TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY[p].label, color: TASK_PRIORITY[p].color })),
        { value: "none" as const, label: "Aucune priorité" },
      ]}
    />
  );
}

/** Échéance : rouge si dépassée, orange si aujourd'hui. */
export function DueDate({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return <span className="text-dim">—</span>;
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const color = done ? "var(--muted)" : date < key ? "var(--danger)" : date === key ? "var(--warning)" : "var(--text)";
  const [y, m, d] = date.split("-");
  return (
    <span className="tabular whitespace-nowrap text-[13px]" style={{ color }} suppressHydrationWarning>
      {d}/{m}/{y.slice(2)}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { createTaskAction } from "@/actions/catalog";
import { TASK_PRIORITIES, TASK_PRIORITY, TASK_STATUS, TASK_STATUSES } from "@/lib/labels";
import type { TaskStatus } from "@/lib/types";

export interface ProjectOption {
  id: string;
  name: string;
  color: string;
  client_name: string | null;
}

/** Création complète d'une tâche (l'édition se fait en ligne sur la page de la tâche). */
export function NewTaskModal({
  open,
  onClose,
  projects,
  defaultProjectId,
  defaultStatus = "todo",
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectOption[];
  defaultProjectId?: string | null;
  defaultStatus?: TaskStatus;
}) {
  const { exec, pending } = useAction();
  const empty = { name: "", description: "", project_id: "", status: defaultStatus as string, priority: "", due_date: "", estimate_hours: "" };
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) setForm({ ...empty, project_id: defaultProjectId ?? "", status: defaultStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(form.estimate_hours.replace(",", "."));
    const res = await exec(
      () =>
        createTaskAction({
          name: form.name,
          description: form.description,
          project_id: form.project_id,
          status: form.status,
          priority: form.priority || null,
          due_date: form.due_date,
          estimate_minutes: form.estimate_hours && Number.isFinite(hours) ? Math.round(hours * 60) : null,
        }),
      "Tâche créée",
    );
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouvelle tâche"
      width={620}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="new-task-form" className="btn btn-primary" disabled={pending}>
            Créer la tâche
          </button>
        </>
      }
    >
      <form id="new-task-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom" htmlFor="t-name">
          <input id="t-name" className="input" value={form.name} onChange={set("name")} required data-autofocus placeholder="Ex. : Maquette de la page d'accueil" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Projet" htmlFor="t-project">
            <select id="t-project" className="select" value={form.project_id} onChange={set("project_id")}>
              <option value="">— Sans projet —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.client_name ? ` · ${p.client_name}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut" htmlFor="t-status">
            <select id="t-status" className="select" value={form.status} onChange={set("status")}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS[s].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priorité" htmlFor="t-priority">
            <select id="t-priority" className="select" value={form.priority} onChange={set("priority")}>
              <option value="">Aucune</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY[p].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Échéance" htmlFor="t-due">
            <input id="t-due" type="date" className="input" value={form.due_date} onChange={set("due_date")} />
          </Field>
          <Field label="Estimation (heures)" htmlFor="t-estimate">
            <input id="t-estimate" className="input" inputMode="decimal" placeholder="Ex. : 2,5" value={form.estimate_hours} onChange={set("estimate_hours")} />
          </Field>
        </div>
        <Field label="Description" htmlFor="t-desc">
          <textarea id="t-desc" className="textarea" rows={4} value={form.description} onChange={set("description")} />
        </Field>
      </form>
    </Modal>
  );
}

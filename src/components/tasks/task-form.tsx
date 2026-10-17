"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { saveTaskAction } from "@/actions/catalog";
import type { Task } from "@/lib/types";

export interface ProjectOption {
  id: string;
  name: string;
  client_name: string | null;
}

export function TaskFormModal({
  open,
  onClose,
  task,
  projects,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  projects: ProjectOption[];
  defaultProjectId?: string | null;
}) {
  const { exec, pending } = useAction();
  const [form, setForm] = useState({ name: "", description: "", project_id: "", is_completed: false });

  useEffect(() => {
    if (!open) return;
    setForm(
      task
        ? { name: task.name, description: task.description ?? "", project_id: task.project_id ?? "", is_completed: task.is_completed }
        : { name: "", description: "", project_id: defaultProjectId ?? "", is_completed: false },
    );
  }, [open, task, defaultProjectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveTaskAction(task?.id ?? null, form), task ? "Tâche mise à jour" : "Tâche créée");
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? "Modifier la tâche" : "Nouvelle tâche"}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={pending}>
            Enregistrer
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom" htmlFor="t-name">
          <input id="t-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-autofocus />
        </Field>
        <Field label="Projet" htmlFor="t-project">
          <select id="t-project" className="select" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
            <option value="">— Sans projet —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.client_name ? ` · ${p.client_name}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" htmlFor="t-desc">
          <textarea id="t-desc" className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        {task && (
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" className="checkbox" checked={form.is_completed} onChange={(e) => setForm({ ...form, is_completed: e.target.checked })} />
            <span>Tâche terminée</span>
          </label>
        )}
      </form>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { saveProjectAction } from "@/actions/catalog";
import type { Project } from "@/lib/types";

export interface ClientOption {
  id: string;
  name: string;
}

export function ProjectFormModal({
  open,
  onClose,
  project,
  clients,
  defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  clients: ClientOption[];
  defaultClientId?: string | null;
}) {
  const { exec, pending } = useAction();
  const [form, setForm] = useState({ name: "", description: "", client_id: "" });

  useEffect(() => {
    if (!open) return;
    setForm(
      project
        ? { name: project.name, description: project.description ?? "", client_id: project.client_id ?? "" }
        : { name: "", description: "", client_id: defaultClientId ?? "" },
    );
  }, [open, project, defaultClientId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveProjectAction(project?.id ?? null, form), project ? "Projet mis à jour" : "Projet créé");
    if (res.ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Modifier le projet" : "Nouveau projet"}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="project-form" className="btn btn-primary" disabled={pending}>
            Enregistrer
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nom" htmlFor="p-name">
          <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-autofocus />
        </Field>
        <Field label="Client" htmlFor="p-client">
          <select id="p-client" className="select" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
            <option value="">— Sans client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" htmlFor="p-desc">
          <textarea id="p-desc" className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { saveProjectAction } from "@/actions/catalog";
import { PROJECT_COLORS } from "@/lib/labels";
import { formatRate } from "@/lib/currency";
import type { Project } from "@/lib/types";

export interface ClientOption {
  id: string;
  name: string;
  hourly_rate?: number;
  currency?: string;
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
  const router = useRouter();
  const { exec, pending } = useAction();
  const [form, setForm] = useState({ name: "", description: "", client_id: "", color: PROJECT_COLORS[0], hourly_rate: "", billable: true });

  useEffect(() => {
    if (!open) return;
    setForm(
      project
        ? {
            name: project.name,
            description: project.description ?? "",
            client_id: project.client_id ?? "",
            color: project.color,
            hourly_rate: project.hourly_rate === null ? "" : String(project.hourly_rate).replace(".", ","),
            billable: project.billable,
          }
        : { name: "", description: "", client_id: defaultClientId ?? "", color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)], hourly_rate: "", billable: true },
    );
  }, [open, project, defaultClientId]);

  const client = clients.find((c) => c.id === form.client_id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await exec(() => saveProjectAction(project?.id ?? null, { ...form, archived: project?.archived ?? false }), project ? "Projet mis à jour" : "Projet créé");
    if (res.ok) {
      onClose();
      if (!project && res.data?.id) router.push(`/projects/${res.data.id}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Modifier le projet" : "Nouveau projet"}
      width={600}
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
        <div>
          <span className="label">Couleur</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm({ ...form, color: c })}
                className={`h-8 w-8 rounded-ui border-2 transition-transform duration-150 ${form.color === c ? "scale-110 border-text" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
                aria-pressed={form.color === c}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Field label="Taux horaire du projet" htmlFor="p-rate">
            <input
              id="p-rate"
              className="input"
              inputMode="decimal"
              placeholder={client?.hourly_rate !== undefined ? `Taux du client : ${formatRate(client.hourly_rate, client.currency)}` : "Taux du client"}
              value={form.hourly_rate}
              onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" className="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} />
          Projet facturable (son temps apparaît dans « À facturer »)
        </label>
        <Field label="Description" htmlFor="p-desc">
          <textarea id="p-desc" className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

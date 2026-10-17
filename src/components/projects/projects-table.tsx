"use client";

import { useState } from "react";
import type { ProjectWithClient } from "@/lib/types";
import { deleteProjectsAction } from "@/actions/catalog";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState, NameLink, Truncate } from "@/components/ui/misc";
import { ProjectFormModal, type ClientOption } from "./project-form";

/**
 * Table CRUD des projets. `defaultClientId` pré-lie les nouveaux projets
 * (bouton « + NOUVEAU PROJET » de la page détail d'un client).
 */
export function ProjectsTable({
  projects,
  clients,
  defaultClientId,
  hideClientColumn = false,
}: {
  projects: ProjectWithClient[];
  clients: ClientOption[];
  defaultClientId?: string;
  hideClientColumn?: boolean;
}) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const selection = useSelection(projects.map((p) => p.id));
  const [editing, setEditing] = useState<ProjectWithClient | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = async (ids: string[]) => (await exec(() => deleteProjectsAction(ids), "Suppression effectuée")).ok;
  const removeOne = async (p: ProjectWithClient) => {
    if (await confirm(`Supprimer le projet « ${p.name} » ? Ses tâches seront conservées sans projet.`)) await remove([p.id]);
  };

  const newButton = (
    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
      + Nouveau projet
    </button>
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BulkBar selection={selection} onDelete={remove} noun="projet" disabled={pending || projects.length === 0} />
        {newButton}
      </div>

      {projects.length === 0 ? (
        <EmptyState title="Aucun projet" hint="Les projets regroupent vos tâches, avec ou sans client." action={newButton} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th>Nom</th>
                {!hideClientColumn && <th>Client</th>}
                <th>Description</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={selection.has(p.id) ? "row-selected" : ""}>
                  <td>
                    <RowCheckbox selection={selection} id={p.id} />
                  </td>
                  <td>
                    <NameLink href={`/projects/${p.id}`} text={p.name} />
                  </td>
                  {!hideClientColumn && (
                    <td>{p.client ? <NameLink href={`/clients/${p.client.id}`} text={p.client.name} max={220} /> : <span className="text-dim">—</span>}</td>
                  )}
                  <td>
                    <Truncate text={p.description} className="text-muted" max={320} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(p)}>
                        ✎
                      </button>
                      <button type="button" className="btn btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => removeOne(p)} disabled={pending}>
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectFormModal
        open={creating || editing !== null}
        project={editing}
        clients={clients}
        defaultClientId={defaultClientId}
        onClose={() => (setCreating(false), setEditing(null))}
      />
    </>
  );
}

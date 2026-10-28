"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import { formatRate, getSymbol } from "@/lib/currency";
import { deleteClientsAction } from "@/actions/catalog";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState, NameLink, Truncate } from "@/components/ui/misc";
import { ClientFormModal } from "./client-form";
import { faPen, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

export function ClientsTable({ clients }: { clients: Client[] }) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const selection = useSelection(clients.map((c) => c.id));
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = async (ids: string[]) => (await exec(() => deleteClientsAction(ids), "Suppression effectuée")).ok;

  const removeOne = async (c: Client) => {
    if (await confirm(`Supprimer le client « ${c.name} » ? Ses projets seront conservés sans client.`)) await remove([c.id]);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BulkBar selection={selection} onDelete={remove} noun="client" disabled={pending || clients.length === 0} />
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon icon={faPlus} /> Nouveau client
        </button>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          title="Aucun client"
          hint="Ajoutez votre premier client pour lui rattacher des projets et des factures."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon icon={faPlus} /> Nouveau client
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <SelectAllCheckbox selection={selection} />
                </th>
                <th>Nom</th>
                <th>Email</th>
                <th>Taux horaire</th>
                <th>Devise</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className={selection.has(c.id) ? "row-selected" : ""}>
                  <td>
                    <RowCheckbox selection={selection} id={c.id} />
                  </td>
                  <td>
                    <NameLink href={`/clients/${c.id}`} text={c.name} />
                  </td>
                  <td>
                    <Truncate text={c.email} max={240} />
                  </td>
                  <td className="tabular whitespace-nowrap">{formatRate(c.hourly_rate, c.currency)}</td>
                  <td className="whitespace-nowrap text-muted">
                    {c.currency} <span className="text-dim">({getSymbol(c.currency)})</span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-icon" title="Modifier" aria-label="Modifier" onClick={() => setEditing(c)}>
                        <Icon icon={faPen} />
                      </button>
                      <button type="button" className="btn btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => removeOne(c)} disabled={pending}>
                        <Icon icon={faTrashCan} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientFormModal open={creating || editing !== null} client={editing} onClose={() => (setCreating(false), setEditing(null))} />
    </>
  );
}

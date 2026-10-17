"use client";

import { deleteEntriesAction } from "@/actions/entries";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from "@/components/ui/selection";
import { EmptyState, NameLink } from "@/components/ui/misc";
import { useTimer } from "@/components/timer/timer-provider";
import { entrySeconds, formatDate, formatHMS, formatTime } from "@/lib/format";

export interface EntryListItem {
  id: string;
  start_time: string;
  end_time: string | null;
  task?: { id: string; name: string; project_name?: string | null } | null;
}

/** Liste d'entrées de temps avec suppression par ligne et suppression groupée. */
export function EntryList({
  entries,
  showTask = false,
  showDate = true,
  onChanged,
}: {
  entries: EntryListItem[];
  showTask?: boolean;
  showDate?: boolean;
  /** Appelé après une suppression réussie (listes chargées côté client). */
  onChanged?: () => void;
}) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const { now, tz } = useTimer();
  const selection = useSelection(entries.map((e) => e.id));

  const remove = async (ids: string[]) => {
    const res = await exec(() => deleteEntriesAction(ids), ids.length > 1 ? "Entrées supprimées" : "Entrée supprimée");
    if (res.ok) onChanged?.();
    return res.ok;
  };

  const removeOne = async (id: string) => {
    if (await confirm("Supprimer cette entrée de temps ?")) await remove([id]);
  };

  if (entries.length === 0) {
    return <EmptyState title="Aucune entrée de temps" hint="Démarrez le timer ou ajoutez une entrée manuelle." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <BulkBar selection={selection} onDelete={remove} noun="entrée" disabled={pending} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10">
                <SelectAllCheckbox selection={selection} />
              </th>
              {showTask && <th>Tâche</th>}
              {showDate && <th>Date</th>}
              <th>Début</th>
              <th>Fin</th>
              <th className="text-right">Durée</th>
              <th className="w-16 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={selection.has(e.id) ? "row-selected" : e.end_time === null ? "row-active" : ""}>
                <td>
                  <RowCheckbox selection={selection} id={e.id} />
                </td>
                {showTask && (
                  <td>
                    {e.task ? (
                      <div className="min-w-0">
                        <NameLink href={`/tasks/${e.task.id}`} text={e.task.name} max={220} />
                        {e.task.project_name && <span className="truncate-cell text-[12px] text-muted">{e.task.project_name}</span>}
                      </div>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                )}
                {showDate && <td className="tabular whitespace-nowrap">{formatDate(e.start_time, tz)}</td>}
                <td className="tabular whitespace-nowrap">{formatTime(e.start_time, tz)}</td>
                <td className="tabular whitespace-nowrap">
                  {e.end_time ? formatTime(e.end_time, tz) : <span className="badge bg-success/15 text-success">En cours</span>}
                </td>
                <td className="duration text-right">{formatHMS(entrySeconds(e.start_time, e.end_time, now))}</td>
                <td className="text-right">
                  <button type="button" className="btn btn-icon" title="Supprimer" aria-label="Supprimer" onClick={() => removeOne(e.id)} disabled={pending}>
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

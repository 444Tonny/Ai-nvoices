"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "./feedback";
import { faCheckDouble, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

/** Sélection multiple sur une liste d'identifiants (purge automatique des ids disparus). */
export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const key = ids.join(",");

  useEffect(() => {
    const valid = new Set(ids);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSelected, key]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({ selected, ids: [...selected], count: selected.size, has: (id: string) => selected.has(id), toggle, toggleAll, allSelected, clear }),
    [selected, toggle, toggleAll, allSelected, clear],
  );
}

export type Selection = ReturnType<typeof useSelection>;

/** Case à cocher d'en-tête (tout / aucun). */
export function SelectAllCheckbox({ selection }: { selection: Selection }) {
  return (
    <input
      type="checkbox"
      className="checkbox"
      aria-label="Tout sélectionner"
      checked={selection.allSelected}
      onChange={selection.toggleAll}
    />
  );
}

export function RowCheckbox({ selection, id }: { selection: Selection; id: string }) {
  return (
    <input
      type="checkbox"
      className="checkbox"
      aria-label="Sélectionner la ligne"
      checked={selection.has(id)}
      onChange={() => selection.toggle(id)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/**
 * Barre « TOUT / AUCUN » + « SUPPRIMER LA SÉLECTION » avec confirmation
 * indiquant le nombre d'éléments. `children` permet d'ajouter d'autres actions groupées.
 */
export function BulkBar({
  selection,
  onDelete,
  noun = "élément",
  nounPlural,
  children,
  disabled,
}: {
  selection: Selection;
  onDelete?: (ids: string[]) => Promise<boolean | void>;
  noun?: string;
  nounPlural?: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const { confirm } = useFeedback();
  const plural = nounPlural ?? `${noun}s`;

  const handleDelete = async () => {
    if (!onDelete || selection.count === 0) return;
    const ok = await confirm({
      title: "Supprimer la sélection",
      message: `Supprimer ${selection.count} ${selection.count > 1 ? plural : noun} ? Cette action est irréversible.`,
    });
    if (!ok) return;
    const res = await onDelete(selection.ids);
    if (res !== false) selection.clear();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-sm" onClick={selection.toggleAll} disabled={disabled}>
        <Icon icon={faCheckDouble} /> Tout / aucun
      </button>
      {onDelete && (
        <button type="button" className="btn btn-sm btn-danger" onClick={handleDelete} disabled={disabled || selection.count === 0}>
          <Icon icon={faTrashCan} /> Supprimer la sélection{selection.count > 0 ? ` (${selection.count})` : ""}
        </button>
      )}
      {children}
    </div>
  );
}

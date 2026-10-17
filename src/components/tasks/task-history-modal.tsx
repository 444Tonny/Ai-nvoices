"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { EntryList } from "@/components/entries/entry-list";
import { getTaskEntriesAction } from "@/actions/catalog";
import { useFeedback } from "@/components/ui/feedback";
import type { TimeEntry } from "@/lib/types";

/** « 🕐 Hist. » : historique des entrées d'une tâche, avec suppression. */
export function TaskHistoryModal({ task, onClose }: { task: { id: string; name: string } | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);

  const load = useCallback(async () => {
    if (!task) return;
    const res = await getTaskEntriesAction(task.id);
    if (res.ok) setEntries(res.data ?? []);
    else toast(res.error, "error");
  }, [task, toast]);

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  return (
    <Modal open={task !== null} onClose={onClose} title={`Historique · ${task?.name ?? ""}`} width={720}>
      {entries === null ? <p className="py-8 text-center text-muted">Chargement…</p> : <EntryList entries={entries} onChanged={load} />}
    </Modal>
  );
}

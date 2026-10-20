"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ColorDot } from "@/components/ui/pills";
import { useTimer } from "./timer-provider";

/** Palette type ⌘K : les 20 tâches les plus récentes, filtrables au clavier. */
export function TaskSwitcher() {
  const { switcherOpen, setSwitcherOpen, recentTasks, start, state } = useTimer();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentTasks;
    return recentTasks.filter((t) =>
      [t.name, t.project_name, t.client_name].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [query, recentTasks]);

  useEffect(() => {
    if (switcherOpen) {
      setQuery("");
      setCursor(0);
    }
  }, [switcherOpen]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = async (taskId: string) => {
    setSwitcherOpen(false);
    await start(taskId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && filtered[cursor]) {
      e.preventDefault();
      void choose(filtered[cursor].id);
    }
  };

  return (
    <Modal open={switcherOpen} onClose={() => setSwitcherOpen(false)} title="Changer de tâche" width={520}>
      <input
        className="input mb-4"
        placeholder="Rechercher une tâche, un projet, un client…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        data-autofocus
      />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-muted">
          {recentTasks.length === 0 ? "Aucune tâche. Créez-en une depuis l'écran Tâches." : "Aucune tâche ne correspond."}
        </p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-1.5">
          {filtered.map((t, i) => {
            const isCurrent = state.task?.id === t.id && state.status !== "idle";
            return (
              <li key={t.id} data-index={i}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(t.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-ui border px-4 py-3 text-left transition-colors duration-150 ${
                    i === cursor ? "border-primary bg-secondary/40" : "border-border bg-surface-2"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-text" title={t.name}>
                      {t.name}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-[13px] text-muted">
                      <ColorDot color={t.project_color} size={8} />
                      {[t.project_name, t.client_name].filter(Boolean).join(" · ") || "Sans projet"}
                    </span>
                  </span>
                  {isCurrent ? <span className="badge bg-success/15 text-success">En cours</span> : <span className="text-dim">▶</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-dim">↑ ↓ pour naviguer · Entrée pour démarrer · Ctrl/⌘ + K pour ouvrir</p>
    </Modal>
  );
}

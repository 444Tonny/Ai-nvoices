"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuItem<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Pastille de couleur affichée devant le libellé. */
  color?: string;
}

/**
 * Menu déroulant léger (portail, fermeture au clic extérieur et à Échap).
 * Utilisé pour les éditions en ligne : statut, priorité, projet…
 */
export function Menu<T extends string>({
  trigger,
  items,
  value,
  onSelect,
  align = "left",
  disabled,
}: {
  trigger: React.ReactNode;
  items: MenuItem<T>[];
  value?: T | null;
  onSelect: (value: T) => void;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 220;
    const left = align === "right" ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8);
    const top = r.bottom + 6 + 320 > window.innerHeight ? Math.max(8, r.top - 6 - Math.min(320, items.length * 40 + 12)) : r.bottom + 6;
    setPos({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex max-w-full items-center rounded-ui text-left transition-colors duration-150 hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="fixed z-[70] max-h-[320px] w-[220px] overflow-auto rounded-ui border border-border bg-surface-2 p-1.5 shadow-2xl"
            style={{ top: pos.top, left: pos.left }}
          >
            {items.map((item) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (item.value !== value) onSelect(item.value);
                }}
                className={`flex w-full items-center gap-2.5 rounded-ui px-3 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-surface-3 ${
                  item.value === value ? "bg-secondary/50" : ""
                }`}
              >
                {item.color && <span className="h-2.5 w-2.5 shrink-0 rounded-ui" style={{ background: item.color }} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.value === value && <span className="text-primary">✓</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

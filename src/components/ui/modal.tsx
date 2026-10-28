"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Largeur initiale (la modale reste redimensionnable par l'utilisateur). */
  width?: number;
}

/** Pile des modales ouvertes : Échap ne ferme que celle du dessus. */
const stack: string[] = [];

/**
 * Modale redimensionnable (coin bas-droit) et scrollable : le contenu reste
 * toujours accessible, quelle que soit la taille de l'écran.
 */
export function Modal({ open, onClose, title, children, footer, width = 560 }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();

  useEffect(() => {
    if (!open) return;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = panelRef.current?.querySelector<HTMLElement>("[autofocus], [data-autofocus], input:not([type=checkbox]), select, textarea");
    focusable?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open, id]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="card flex max-h-[90vh] min-h-[160px] min-w-[300px] max-w-[95vw] flex-col overflow-hidden shadow-2xl"
        style={{ width, resize: "both" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="truncate text-[18px]">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-icon" aria-label="Fermer">
            <Icon icon={faXmark} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

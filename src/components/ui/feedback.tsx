"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal } from "./modal";
import { faCircleCheck, faCircleExclamation, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type ToastKind = "error" | "success" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackContext {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
}

const Ctx = createContext<FeedbackContext | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    setConfirmState({ danger: true, ...o });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <Modal
        open={confirmState !== null}
        onClose={() => close(false)}
        title={confirmState?.title ?? "Confirmation"}
        width={440}
        footer={
          <>
            <button type="button" className="btn" onClick={() => close(false)}>
              Annuler
            </button>
            <button
              type="button"
              autoFocus
              className={`btn ${confirmState?.danger ? "btn-danger" : "btn-primary"}`}
              onClick={() => close(true)}
            >
              {confirmState?.confirmLabel ?? (confirmState?.danger ? "Supprimer" : "Confirmer")}
            </button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-text">{confirmState?.message}</p>
      </Modal>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-ui border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-danger/50 bg-surface-2 text-text"
                : t.kind === "success"
                  ? "border-success/50 bg-surface-2 text-text"
                  : "border-border bg-surface-2 text-text"
            }`}
          >
            <Icon
              icon={t.kind === "error" ? faCircleExclamation : t.kind === "success" ? faCircleCheck : faCircleInfo}
              className={`mt-0.5 ${t.kind === "error" ? "text-danger" : t.kind === "success" ? "text-success" : "text-primary"}`}
            />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFeedback doit être utilisé dans FeedbackProvider");
  return ctx;
}

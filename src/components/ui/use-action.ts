"use client";

import { useCallback, useTransition } from "react";
import type { ActionResult } from "@/lib/types";
import { useFeedback } from "./feedback";

/**
 * Appelle une Server Action, affiche l'erreur éventuelle en toast et
 * retourne le résultat. `pending` reste vrai pendant le rafraîchissement.
 */
export function useAction() {
  const { toast } = useFeedback();
  const [pending, startTransition] = useTransition();

  const exec = useCallback(
    <T,>(action: () => Promise<ActionResult<T>>, successMessage?: string): Promise<ActionResult<T>> =>
      new Promise((resolve) => {
        startTransition(async () => {
          try {
            const res = await action();
            if (!res.ok) toast(res.error, "error");
            else if (successMessage) toast(successMessage, "success");
            resolve(res);
          } catch (e) {
            const error = e instanceof Error ? e.message : "Erreur réseau";
            toast(error, "error");
            resolve({ ok: false, error });
          }
        });
      }),
    [toast],
  );

  return { exec, pending };
}

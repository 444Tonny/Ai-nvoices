import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { DomainError, type DB } from "@/lib/domain/core";
import { firstIssue } from "@/lib/domain/schemas";
import type { ActionResult } from "@/lib/types";

/** Valide une entrée avec Zod et lève une DomainError lisible en cas d'échec. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const res = schema.safeParse(input);
  if (!res.success) throw new DomainError(firstIssue(res.error));
  return res.data;
}

/**
 * Exécute une mutation pour l'utilisateur connecté, revalide tout le layout
 * (widget timer, total du jour, tables) et normalise le résultat.
 */
export async function run<T>(fn: (db: DB) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const { supabase } = await requireUser();
    const data = await fn(supabase);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inattendue";
    if (!(e instanceof DomainError)) console.error(e);
    return { ok: false, error: message };
  }
}

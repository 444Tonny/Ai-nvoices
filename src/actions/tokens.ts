"use server";

import { z } from "zod";
import { parse, run } from "./_run";
import { idSchema } from "@/lib/domain/schemas";
import { createToken, revokeToken } from "@/lib/domain/tokens";

const nameSchema = z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1, "Nom requis").max(80));

/** Crée un jeton d'accès MCP. Le jeton en clair n'est renvoyé qu'une fois. */
export async function createTokenAction(name: string) {
  return run(async (db) => {
    const { token, record } = await createToken(db, parse(nameSchema, name));
    return { token, id: record.id };
  });
}

export async function revokeTokenAction(id: string) {
  return run((db) => revokeToken(db, parse(idSchema, id)));
}

import { createHash, randomBytes } from "node:crypto";
import type { ApiToken } from "@/lib/types";
import { must, type DB } from "./core";

/** Empreinte stockée en base (le jeton en clair n'est jamais enregistré). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return `ainv_${randomBytes(24).toString("base64url")}`;
}

export async function listTokens(db: DB): Promise<ApiToken[]> {
  return must(
    await db.from("api_tokens").select("id, created_at, name, token_prefix, last_used_at, revoked_at").order("created_at", { ascending: false }),
  );
}

/** Crée un jeton et le retourne en clair : c'est la seule fois où il est visible. */
export async function createToken(db: DB, name: string): Promise<{ token: string; record: ApiToken }> {
  const token = generateToken();
  const record = must(
    await db
      .from("api_tokens")
      .insert({ name, token_prefix: token.slice(0, 12), token_hash: hashToken(token) })
      .select("id, created_at, name, token_prefix, last_used_at, revoked_at")
      .single(),
  ) as ApiToken;
  return { token, record };
}

export async function revokeToken(db: DB, id: string): Promise<void> {
  must(await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id));
}

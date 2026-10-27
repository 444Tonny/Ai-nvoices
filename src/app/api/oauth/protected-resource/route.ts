import { cors, json, originOf, protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** /.well-known/oauth-protected-resource (réécrit vers cette route). */
export function GET(request: Request) {
  return json(protectedResourceMetadata(originOf(request)));
}

export const OPTIONS = cors;

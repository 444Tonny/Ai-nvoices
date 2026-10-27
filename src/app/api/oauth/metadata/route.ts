import { authorizationServerMetadata, cors, json, originOf } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** /.well-known/oauth-authorization-server (réécrit vers cette route). */
export function GET(request: Request) {
  return json(authorizationServerMetadata(originOf(request)));
}

export const OPTIONS = cors;

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultTemplate, listTemplates } from "@/lib/domain/templates";
import { listTokens } from "@/lib/domain/tokens";
import { PageHeader } from "@/components/ui/misc";
import { TemplatesManager } from "@/components/settings/templates-manager";
import { TokensManager } from "@/components/settings/tokens-manager";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let templates = await listTemplates(supabase);
  if (templates.length === 0) {
    await ensureDefaultTemplate(supabase);
    templates = await listTemplates(supabase);
  }
  const tokens = await listTokens(supabase);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Profils émetteur des factures et accès des agents (MCP)." />
      <h2 className="mb-4 text-[20px]">Profils émetteur</h2>
      <TemplatesManager templates={templates} userId={user.id} />
      <div className="mt-10">
        <TokensManager tokens={tokens} mcpUrl={`${proto}://${host}/api/mcp`} />
      </div>
    </>
  );
}

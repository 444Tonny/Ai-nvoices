import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultTemplate, listTemplates } from "@/lib/domain/templates";
import { PageHeader } from "@/components/ui/misc";
import { TemplatesManager } from "@/components/settings/templates-manager";

export const metadata: Metadata = { title: "Profils émetteur" };

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
  return (
    <>
      <PageHeader title="Profils émetteur" subtitle="Informations de votre entreprise affichées sur les factures PDF." />
      <TemplatesManager templates={templates} userId={user.id} />
    </>
  );
}

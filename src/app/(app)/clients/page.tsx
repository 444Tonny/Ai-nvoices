import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listClients } from "@/lib/domain/clients";
import { PageHeader } from "@/components/ui/misc";
import { ClientsTable } from "@/components/clients/clients-table";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const supabase = await createClient();
  const clients = await listClients(supabase);
  return (
    <>
      <PageHeader title="Clients" subtitle={`${clients.length} client${clients.length > 1 ? "s" : ""}`} />
      <ClientsTable clients={clients} />
    </>
  );
}

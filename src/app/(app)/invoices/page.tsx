import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceDetail, listInvoices, nextInvoiceNumber } from "@/lib/domain/invoices";
import { listClients } from "@/lib/domain/clients";
import { listTemplates } from "@/lib/domain/templates";
import { invoiceStatusSchema } from "@/lib/domain/schemas";
import { PageHeader } from "@/components/ui/misc";
import { InvoicesView } from "@/components/invoices/invoices-view";

export const metadata: Metadata = { title: "Factures" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; selected?: string }> }) {
  const params = await searchParams;
  const status = invoiceStatusSchema.safeParse(params.status);
  const filter = status.success ? status.data : "all";
  const supabase = await createClient();

  // La synchronisation des heures (factures « unpaid ») a lieu dans listInvoices / getInvoiceDetail.
  const detail = params.selected ? await getInvoiceDetail(supabase, params.selected).catch(() => null) : null;
  const [invoices, clients, templates, nextNumber] = await Promise.all([
    listInvoices(supabase, status.success ? { status: status.data } : {}),
    listClients(supabase),
    listTemplates(supabase),
    nextInvoiceNumber(supabase),
  ]);

  return (
    <>
      <PageHeader
        title="Factures"
        subtitle="Cliquez sur une facture pour afficher ses actions et ses lignes."
        actions={
          <Link href="/settings" className="btn btn-sm">
            Profils émetteur
          </Link>
        }
      />
      <InvoicesView
        invoices={invoices}
        filter={filter}
        detail={detail}
        clients={clients.map((c) => ({ id: c.id, name: c.name, currency: c.currency }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        nextNumber={nextNumber}
      />
    </>
  );
}

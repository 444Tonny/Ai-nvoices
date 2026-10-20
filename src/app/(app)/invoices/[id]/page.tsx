import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceDetail, listUnbilled, nextInvoiceNumber } from "@/lib/domain/invoices";
import { listClients } from "@/lib/domain/clients";
import { listTemplates } from "@/lib/domain/templates";
import { BackButton } from "@/components/ui/back-button";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const detail = await getInvoiceDetail(supabase, id).catch(() => null);
  if (!detail) notFound();

  const [unbilled, clients, templates, nextNumber] = await Promise.all([
    detail.invoice.client_id && detail.invoice.status === "unpaid" ? listUnbilled(supabase, { clientId: detail.invoice.client_id }) : Promise.resolve([]),
    listClients(supabase),
    listTemplates(supabase),
    nextInvoiceNumber(supabase),
  ]);

  return (
    <>
      <BackButton fallback="/invoices?tab=invoices" />
      <InvoiceEditor
        detail={detail}
        unbilled={unbilled[0] ?? null}
        clients={clients.map((c) => ({ id: c.id, name: c.name, currency: c.currency }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, default_footer_text: t.default_footer_text }))}
        nextNumber={nextNumber}
      />
    </>
  );
}

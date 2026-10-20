import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClient, listClients } from "@/lib/domain/clients";
import { listProjectSummaries } from "@/lib/domain/projects";
import { listInvoices, listUnbilled } from "@/lib/domain/invoices";
import { formatDay, formatHoursMinutes } from "@/lib/format";
import { formatMoney, formatRate } from "@/lib/currency";
import { PageHeader, StatCard, StatusBadge } from "@/components/ui/misc";
import { BackButton } from "@/components/ui/back-button";
import { ProjectCards } from "@/components/projects/project-cards";
import { InvoiceUnbilledButton } from "@/components/invoices/invoice-unbilled-button";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const client = await getClient(supabase, id).catch(() => null);
  if (!client) notFound();

  const [projects, invoices, unbilledList, clients] = await Promise.all([
    listProjectSummaries(supabase, { clientId: id, includeArchived: true }),
    listInvoices(supabase, { clientId: id }),
    listUnbilled(supabase, { clientId: id }),
    listClients(supabase),
  ]);
  const unbilled = unbilledList[0] ?? null;
  const totalSeconds = projects.reduce((s, p) => s + p.total_seconds, 0);
  const sameCurrency = invoices.filter((i) => i.currency === client.currency);
  const outstanding = sameCurrency.filter((i) => i.status !== "paid").reduce((s, i) => s + i.total, 0);

  return (
    <>
      <BackButton fallback="/clients" />
      <PageHeader
        title={<span className="break-words">{client.name}</span>}
        subtitle={[client.email, client.phone].filter(Boolean).join(" · ") || "Client"}
        actions={unbilled ? <InvoiceUnbilledButton clientId={client.id} label={`Facturer ${formatMoney(unbilled.amount, unbilled.currency)}`} /> : undefined}
      />

      <section className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Temps total" value={formatHoursMinutes(totalSeconds)} hint={`${projects.length} projet${projects.length > 1 ? "s" : ""}`} />
        <StatCard label="Taux horaire" value={formatRate(client.hourly_rate, client.currency)} hint="Par défaut pour ses projets" />
        <StatCard label="À facturer" value={formatMoney(unbilled?.amount ?? 0, client.currency)} hint={formatHoursMinutes(unbilled?.seconds ?? 0)} />
        <StatCard label="En attente de paiement" value={formatMoney(outstanding, client.currency)} hint="Factures non payées et envoyées" />
      </section>

      {client.address && (
        <div className="card mb-9 px-6 py-5">
          <p className="label">Adresse</p>
          <p className="whitespace-pre-line">{client.address}</p>
        </div>
      )}

      <h2 className="mb-4 text-[20px]">Projets</h2>
      <ProjectCards
        projects={projects}
        clients={clients.map((c) => ({ id: c.id, name: c.name, hourly_rate: c.hourly_rate, currency: c.currency }))}
        defaultClientId={id}
      />

      <h2 className="mb-4 mt-10 text-[20px]">Factures</h2>
      {invoices.length === 0 ? (
        <p className="card px-6 py-8 text-center text-muted">Aucune facture pour ce client.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Date</th>
                <th>Statut</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/invoices/${i.id}`} className="link">
                      {i.number}
                    </Link>
                  </td>
                  <td className="tabular">{formatDay(i.invoice_date)}</td>
                  <td>
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="tabular text-right">{formatMoney(i.total, i.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

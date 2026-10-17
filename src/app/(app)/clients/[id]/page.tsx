import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClient, listClients } from "@/lib/domain/clients";
import { listProjects } from "@/lib/domain/projects";
import { listTaskRows } from "@/lib/domain/tasks";
import { listInvoices } from "@/lib/domain/invoices";
import { formatHoursMinutes, formatDay } from "@/lib/format";
import { formatMoney, formatRate } from "@/lib/currency";
import { PageHeader, StatCard, StatusBadge } from "@/components/ui/misc";
import { BackButton } from "@/components/ui/back-button";
import { ProjectsTable } from "@/components/projects/projects-table";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const client = await getClient(supabase, id).catch(() => null);
  if (!client) notFound();

  const [projects, tasks, invoices, clients] = await Promise.all([
    listProjects(supabase, { clientId: id }),
    listTaskRows(supabase, { clientId: id }),
    listInvoices(supabase, { clientId: id }),
    listClients(supabase),
  ]);
  const totalSeconds = tasks.reduce((s, t) => s + t.total_seconds, 0);
  const sameCurrency = invoices.filter((i) => i.currency === client.currency);
  const invoiced = sameCurrency.reduce((s, i) => s + i.total, 0);
  const unpaid = sameCurrency.filter((i) => i.status !== "paid").reduce((s, i) => s + i.total, 0);

  return (
    <>
      <BackButton fallback="/clients" />
      <PageHeader
        title={<span className="break-words">{client.name}</span>}
        subtitle={[client.email, client.phone].filter(Boolean).join(" · ") || "Client"}
      />

      <section className="mb-9 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Temps total" value={formatHoursMinutes(totalSeconds)} hint={`${tasks.length} tâche${tasks.length > 1 ? "s" : ""}`} />
        <StatCard label="Taux horaire" value={formatRate(client.hourly_rate, client.currency)} hint={client.currency} />
        <StatCard label="Facturé" value={formatMoney(invoiced, client.currency)} hint={`${invoices.length} facture${invoices.length > 1 ? "s" : ""}`} />
        <StatCard label="Reste à encaisser" value={formatMoney(unpaid, client.currency)} hint="Factures non payées et envoyées" />
      </section>

      {client.address && (
        <div className="card mb-9 px-6 py-5">
          <p className="label">Adresse</p>
          <p className="whitespace-pre-line">{client.address}</p>
        </div>
      )}

      <h2 className="mb-4 text-[20px]">Projets</h2>
      <ProjectsTable projects={projects} clients={clients.map((c) => ({ id: c.id, name: c.name }))} defaultClientId={id} hideClientColumn />

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
                    <Link href={`/invoices?selected=${i.id}`} className="link">
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

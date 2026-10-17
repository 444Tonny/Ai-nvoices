import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProject, listProjects } from "@/lib/domain/projects";
import { listTaskRows } from "@/lib/domain/tasks";
import { listInvoiceOptions } from "@/lib/domain/invoices";
import { formatHoursMinutes } from "@/lib/format";
import { formatMoney } from "@/lib/currency";
import { round2 } from "@/lib/numbers";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { BackButton } from "@/components/ui/back-button";
import { TasksTable } from "@/components/tasks/tasks-table";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const project = await getProject(supabase, id).catch(() => null);
  if (!project) notFound();

  const [tasks, projects, invoices] = await Promise.all([
    listTaskRows(supabase, { projectId: id }),
    listProjects(supabase),
    listInvoiceOptions(supabase),
  ]);
  const renderedAt = Date.now();
  const totalSeconds = tasks.reduce((s, t) => s + t.total_seconds, 0);
  const open = tasks.filter((t) => !t.is_completed).length;
  const value = project.client ? round2((totalSeconds / 3600) * Number(project.client.hourly_rate)) : null;

  return (
    <>
      <BackButton fallback="/projects" />
      <PageHeader
        title={<span className="break-words">{project.name}</span>}
        subtitle={
          project.client ? (
            <>
              Client :{" "}
              <Link href={`/clients/${project.client.id}`} className="link">
                {project.client.name}
              </Link>
            </>
          ) : (
            "Projet sans client"
          )
        }
      />

      <section className="mb-9 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label="Temps total" value={formatHoursMinutes(totalSeconds)} />
        <StatCard label="Tâches" value={String(tasks.length)} hint={`${open} ouverte${open > 1 ? "s" : ""}`} />
        <StatCard
          label="Valeur estimée"
          value={value !== null && project.client ? formatMoney(value, project.client.currency) : "—"}
          hint={project.client ? "Temps total × taux du client" : "Aucun client rattaché"}
        />
      </section>

      {project.description && (
        <div className="card mb-9 px-6 py-5">
          <p className="label">Description</p>
          <p className="whitespace-pre-line">{project.description}</p>
        </div>
      )}

      <h2 className="mb-4 text-[20px]">Tâches</h2>
      <TasksTable
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, client_name: p.client?.name ?? null }))}
        invoices={invoices}
        renderedAt={renderedAt}
        defaultProjectId={id}
        hideProjectColumns
      />
    </>
  );
}

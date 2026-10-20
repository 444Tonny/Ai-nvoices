import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjectSummary, listProjects } from "@/lib/domain/projects";
import { listTaskRows } from "@/lib/domain/tasks";
import { listInvoiceOptions } from "@/lib/domain/invoices";
import { listClients } from "@/lib/domain/clients";
import { BackButton } from "@/components/ui/back-button";
import { ProjectHeader } from "@/components/projects/project-header";
import { TasksView } from "@/components/tasks/tasks-view";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const project = await getProjectSummary(supabase, id).catch(() => null);
  if (!project) notFound();

  const [tasks, projects, invoices, clients] = await Promise.all([
    listTaskRows(supabase, { projectId: id }),
    listProjects(supabase),
    listInvoiceOptions(supabase),
    listClients(supabase),
  ]);
  const renderedAt = Date.now();

  return (
    <>
      <BackButton fallback="/projects" />
      <ProjectHeader
        project={project}
        tasks={tasks}
        invoices={invoices}
        clients={clients.map((c) => ({ id: c.id, name: c.name, hourly_rate: c.hourly_rate, currency: c.currency }))}
      />
      <TasksView
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color, client_name: p.client?.name ?? null }))}
        invoices={invoices}
        renderedAt={renderedAt}
        defaultProjectId={id}
        showProjectFilter={false}
      />
    </>
  );
}

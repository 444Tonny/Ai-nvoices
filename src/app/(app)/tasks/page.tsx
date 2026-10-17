import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listTaskRows } from "@/lib/domain/tasks";
import { listProjects } from "@/lib/domain/projects";
import { listInvoiceOptions } from "@/lib/domain/invoices";
import { PageHeader } from "@/components/ui/misc";
import { TasksTable } from "@/components/tasks/tasks-table";

export const metadata: Metadata = { title: "Tâches" };

export default async function TasksPage() {
  const supabase = await createClient();
  const [tasks, projects, invoices] = await Promise.all([listTaskRows(supabase), listProjects(supabase), listInvoiceOptions(supabase)]);
  const renderedAt = Date.now();
  return (
    <>
      <PageHeader title="Tâches" subtitle={`${tasks.length} tâche${tasks.length > 1 ? "s" : ""}`} />
      <TasksTable
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, client_name: p.client?.name ?? null }))}
        invoices={invoices}
        renderedAt={renderedAt}
      />
    </>
  );
}

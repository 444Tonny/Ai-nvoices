import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listTaskRows } from "@/lib/domain/tasks";
import { listProjects } from "@/lib/domain/projects";
import { listInvoiceOptions } from "@/lib/domain/invoices";
import { PageHeader } from "@/components/ui/misc";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "Tâches" };

export default async function TasksPage() {
  const supabase = await createClient();
  const [tasks, projects, invoices] = await Promise.all([listTaskRows(supabase), listProjects(supabase), listInvoiceOptions(supabase)]);
  const renderedAt = Date.now();
  const open = tasks.filter((t) => t.status !== "done").length;
  return (
    <>
      <PageHeader title="Tâches" subtitle={`${open} tâche${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""} sur ${tasks.length}`} />
      <TasksView
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color, client_name: p.client?.name ?? null }))}
        invoices={invoices}
        renderedAt={renderedAt}
      />
    </>
  );
}

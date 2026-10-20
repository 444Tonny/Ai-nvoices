import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTaskRow, listTaskOptions } from "@/lib/domain/tasks";
import { listEntriesForTask } from "@/lib/domain/entries";
import { listProjects } from "@/lib/domain/projects";
import { listInvoiceOptions } from "@/lib/domain/invoices";
import { BackButton } from "@/components/ui/back-button";
import { TaskDetail } from "@/components/tasks/task-detail";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const task = await getTaskRow(supabase, id).catch(() => null);
  if (!task) notFound();
  const [entries, projects, invoices, taskOptions] = await Promise.all([
    listEntriesForTask(supabase, id),
    listProjects(supabase),
    listInvoiceOptions(supabase),
    listTaskOptions(supabase),
  ]);
  const renderedAt = Date.now();

  return (
    <>
      <BackButton fallback="/tasks" />
      <TaskDetail
        task={task}
        entries={entries}
        projects={projects.map((p) => ({ id: p.id, name: p.name, color: p.color, client_name: p.client?.name ?? null }))}
        invoices={invoices}
        taskOptions={taskOptions}
        renderedAt={renderedAt}
      />
    </>
  );
}

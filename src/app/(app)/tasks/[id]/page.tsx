import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTaskRow } from "@/lib/domain/tasks";
import { listEntriesForTask } from "@/lib/domain/entries";
import { PageHeader } from "@/components/ui/misc";
import { BackButton } from "@/components/ui/back-button";
import { TaskDetail } from "@/components/tasks/task-detail";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const task = await getTaskRow(supabase, id).catch(() => null);
  if (!task) notFound();
  const entries = await listEntriesForTask(supabase, id);
  const renderedAt = Date.now();

  return (
    <>
      <BackButton fallback="/tasks" />
      <PageHeader
        title={<span className="break-words">{task.name}</span>}
        subtitle={
          <>
            {task.project ? (
              <Link href={`/projects/${task.project.id}`} className="link">
                {task.project.name}
              </Link>
            ) : (
              "Sans projet"
            )}
            {task.client && (
              <>
                {" · "}
                <Link href={`/clients/${task.client.id}`} className="link">
                  {task.client.name}
                </Link>
              </>
            )}
          </>
        }
      />
      <TaskDetail task={task} entries={entries} renderedAt={renderedAt} />
    </>
  );
}

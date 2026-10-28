"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectSummary, TaskRow } from "@/lib/types";
import type { InvoiceOption } from "@/lib/domain/invoices";
import { deleteProjectsAction, setProjectArchivedAction } from "@/actions/catalog";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/misc";
import { ColorDot } from "@/components/ui/pills";
import { BillTasksModal } from "@/components/tasks/bill-tasks-modal";
import { formatMoney, formatRate } from "@/lib/currency";
import { formatHoursMinutes } from "@/lib/format";
import { ProjectFormModal, type ClientOption } from "./project-form";
import { TaskProgress } from "./project-cards";
import { faFileInvoiceDollar, faPen } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@/components/ui/icon";
import { faClock, faCoins, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";

export function ProjectHeader({
  project,
  tasks,
  invoices,
  clients,
}: {
  project: ProjectSummary;
  tasks: TaskRow[];
  invoices: InvoiceOption[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [billing, setBilling] = useState(false);
  const billable = tasks.filter((t) => t.unbilled_seconds > 0);
  const total = Object.values(project.task_counts).reduce((s, n) => s + n, 0);

  const remove = async () => {
    if (!(await confirm(`Supprimer le projet « ${project.name} » ? Ses tâches seront conservées sans projet.`))) return;
    const res = await exec(() => deleteProjectsAction([project.id]), "Projet supprimé");
    if (res.ok) router.push("/projects");
  };

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[26px] leading-tight">
            <ColorDot color={project.color} size={14} />
            <span className="break-words">{project.name}</span>
            {project.archived && <span className="badge bg-surface-3 text-muted">Archivé</span>}
          </h1>
          <p className="mt-1.5 text-muted">
            {project.client ? (
              <Link href={`/clients/${project.client.id}`} className="link">
                {project.client.name}
              </Link>
            ) : (
              "Sans client"
            )}
            {" · "}
            {project.billable ? formatRate(project.rate, project.currency) : "Non facturable"}
            {project.hourly_rate !== null && project.billable && <span className="text-dim"> (taux du projet)</span>}
          </p>
          {project.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-[14px] text-muted">{project.description}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={() => setBilling(true)} disabled={billable.length === 0}>
            <Icon icon={faFileInvoiceDollar} /> Facturer {project.unbilled_amount > 0 ? formatMoney(project.unbilled_amount, project.currency) : ""}
          </button>
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            <Icon icon={faPen} /> Modifier
          </button>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => exec(() => setProjectArchivedAction(project.id, !project.archived), project.archived ? "Projet réactivé" : "Projet archivé")}
          >
            {project.archived ? "Réactiver" : "Archiver"}
          </button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}>
            Supprimer
          </button>
        </div>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Temps total" value={formatHoursMinutes(project.total_seconds)} icon={faClock} />
        <StatCard label="À facturer" value={formatMoney(project.unbilled_amount, project.currency)} hint={formatHoursMinutes(project.unbilled_seconds)} icon={faHourglassHalf} />
        <StatCard label="Valeur du temps" value={formatMoney((project.total_seconds / 3600) * project.rate, project.currency)} hint="Temps total × taux" icon={faCoins} />
        <div className="card px-6 py-5">
          <p className="label mb-3">Avancement</p>
          <TaskProgress counts={project.task_counts} />
          <p className="mt-2 text-[13px] text-muted">
            {project.task_counts.done}/{total} terminée{project.task_counts.done > 1 ? "s" : ""}
          </p>
        </div>
      </section>

      <ProjectFormModal open={editing} onClose={() => setEditing(false)} project={project} clients={clients} />
      <BillTasksModal tasks={billing ? billable : []} invoices={invoices} onClose={() => setBilling(false)} />
    </>
  );
}

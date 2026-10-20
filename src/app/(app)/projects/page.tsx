import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listProjectSummaries } from "@/lib/domain/projects";
import { listClients } from "@/lib/domain/clients";
import { PageHeader } from "@/components/ui/misc";
import { ProjectCards } from "@/components/projects/project-cards";

export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const supabase = await createClient();
  const [all, clients] = await Promise.all([listProjectSummaries(supabase, { includeArchived: true }), listClients(supabase)]);
  const projects = all.filter((p) => p.archived === showArchived);
  const archivedCount = all.filter((p) => p.archived).length;

  return (
    <>
      <PageHeader
        title="Projets"
        subtitle={`${all.length - archivedCount} projet${all.length - archivedCount > 1 ? "s" : ""} actif${all.length - archivedCount > 1 ? "s" : ""}`}
        actions={
          <div className="flex rounded-ui border border-border bg-surface-2 p-1">
            <Link href="/projects" className={`rounded-ui px-4 py-1.5 text-[13px] font-semibold uppercase tracking-wider ${!showArchived ? "bg-primary text-on-fill" : "text-muted hover:text-text"}`}>
              Actifs
            </Link>
            <Link href="/projects?archived=1" className={`rounded-ui px-4 py-1.5 text-[13px] font-semibold uppercase tracking-wider ${showArchived ? "bg-primary text-on-fill" : "text-muted hover:text-text"}`}>
              Archivés ({archivedCount})
            </Link>
          </div>
        }
      />
      <ProjectCards projects={projects} clients={clients.map((c) => ({ id: c.id, name: c.name, hourly_rate: c.hourly_rate, currency: c.currency }))} />
    </>
  );
}

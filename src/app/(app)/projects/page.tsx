import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/domain/projects";
import { listClients } from "@/lib/domain/clients";
import { PageHeader } from "@/components/ui/misc";
import { ProjectsTable } from "@/components/projects/projects-table";

export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage() {
  const supabase = await createClient();
  const [projects, clients] = await Promise.all([listProjects(supabase), listClients(supabase)]);
  return (
    <>
      <PageHeader title="Projets" subtitle={`${projects.length} projet${projects.length > 1 ? "s" : ""}`} />
      <ProjectsTable projects={projects} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}

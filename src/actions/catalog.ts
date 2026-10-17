"use server";

/**
 * Server Actions des clients, projets et tâches.
 * Fines enveloppes : validation Zod puis appel de la couche domaine.
 */
import { parse, run } from "./_run";
import { clientInput, idSchema, idsSchema, projectInput, taskInput } from "@/lib/domain/schemas";
import { createClient, deleteClients, updateClient } from "@/lib/domain/clients";
import { createProject, deleteProjects, updateProject } from "@/lib/domain/projects";
import { createTask, deleteTasks, setTaskCompleted, updateTask } from "@/lib/domain/tasks";
import { listEntriesForTask } from "@/lib/domain/entries";
import { requireUser } from "@/lib/supabase/server";
import type { ActionResult, TimeEntry } from "@/lib/types";

// --- Clients ---------------------------------------------------------------
export async function saveClientAction(id: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(clientInput, input);
    const c = id ? await updateClient(db, parse(idSchema, id), data) : await createClient(db, data);
    return { id: c.id };
  });
}

export async function deleteClientsAction(ids: string[]) {
  return run((db) => deleteClients(db, parse(idsSchema, ids)));
}

// --- Projets ---------------------------------------------------------------
export async function saveProjectAction(id: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(projectInput, input);
    const p = id ? await updateProject(db, parse(idSchema, id), data) : await createProject(db, data);
    return { id: p.id };
  });
}

export async function deleteProjectsAction(ids: string[]) {
  return run((db) => deleteProjects(db, parse(idsSchema, ids)));
}

// --- Tâches ----------------------------------------------------------------
export async function saveTaskAction(id: string | null, input: unknown) {
  return run(async (db) => {
    const data = parse(taskInput, input);
    const t = id ? await updateTask(db, parse(idSchema, id), data) : await createTask(db, data);
    return { id: t.id };
  });
}

export async function setTaskCompletedAction(id: string, isCompleted: boolean) {
  return run((db) => setTaskCompleted(db, parse(idSchema, id), Boolean(isCompleted)));
}

export async function deleteTasksAction(ids: string[]) {
  return run((db) => deleteTasks(db, parse(idsSchema, ids)));
}

/** Lecture à la demande de l'historique d'une tâche (modale « Hist. »). */
export async function getTaskEntriesAction(taskId: string): Promise<ActionResult<TimeEntry[]>> {
  try {
    const { supabase } = await requireUser();
    return { ok: true, data: await listEntriesForTask(supabase, parse(idSchema, taskId)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue" };
  }
}

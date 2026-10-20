"use server";

/** Server Actions des clients, projets et tâches : validation Zod puis couche domaine. */
import { parse, run } from "./_run";
import { clientInput, idSchema, idsSchema, projectInput, taskInput, taskPatch, taskStatusSchema } from "@/lib/domain/schemas";
import { createClient, deleteClients, updateClient } from "@/lib/domain/clients";
import { createProject, deleteProjects, updateProject } from "@/lib/domain/projects";
import { createTask, deleteTasks, moveTask, updateTask } from "@/lib/domain/tasks";
import { listEntriesForTask } from "@/lib/domain/entries";
import { requireUser } from "@/lib/supabase/server";
import type { ActionResult, TimeEntryWithTask } from "@/lib/types";
import { z } from "zod";

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

export async function setProjectArchivedAction(id: string, archived: boolean) {
  return run(async (db) => {
    await updateProject(db, parse(idSchema, id), { archived: Boolean(archived) });
  });
}

export async function deleteProjectsAction(ids: string[]) {
  return run((db) => deleteProjects(db, parse(idsSchema, ids)));
}

// --- Tâches ----------------------------------------------------------------
export async function createTaskAction(input: unknown) {
  return run(async (db) => {
    const t = await createTask(db, parse(taskInput, input));
    return { id: t.id };
  });
}

/** Modification d'un ou plusieurs champs (édition en ligne). */
export async function updateTaskAction(id: string, patch: unknown) {
  return run(async (db) => {
    await updateTask(db, parse(idSchema, id), parse(taskPatch, patch));
  });
}

/** Glisser-déposer du tableau : nouveau statut et nouvelle position. */
export async function moveTaskAction(id: string, status: string, position: number) {
  return run((db) => moveTask(db, parse(idSchema, id), parse(taskStatusSchema, status), parse(z.number(), position)));
}

export async function deleteTasksAction(ids: string[]) {
  return run((db) => deleteTasks(db, parse(idsSchema, ids)));
}

/** Lecture à la demande de l'historique d'une tâche (panneau latéral). */
export async function getTaskEntriesAction(taskId: string): Promise<ActionResult<TimeEntryWithTask[]>> {
  try {
    const { supabase } = await requireUser();
    return { ok: true, data: await listEntriesForTask(supabase, parse(idSchema, taskId)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue" };
  }
}

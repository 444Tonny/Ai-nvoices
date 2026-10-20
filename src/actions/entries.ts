"use server";

import { parse, run } from "./_run";
import { entryPatch, idSchema, idsSchema, manualEntryInput } from "@/lib/domain/schemas";
import { addManualEntry, deleteEntries, updateEntry } from "@/lib/domain/entries";

export async function addManualEntryAction(input: unknown) {
  return run(async (db) => {
    await addManualEntry(db, parse(manualEntryInput, input));
  });
}

export async function updateEntryAction(id: string, patch: unknown) {
  return run(async (db) => {
    await updateEntry(db, parse(idSchema, id), parse(entryPatch, patch));
  });
}

export async function deleteEntriesAction(ids: string[]) {
  return run((db) => deleteEntries(db, parse(idsSchema, ids)));
}

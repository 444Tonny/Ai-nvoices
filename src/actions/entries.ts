"use server";

import { parse, run } from "./_run";
import { idsSchema, manualEntryInput } from "@/lib/domain/schemas";
import { addManualEntry, deleteEntries } from "@/lib/domain/entries";

export async function addManualEntryAction(input: unknown) {
  return run(async (db) => {
    await addManualEntry(db, parse(manualEntryInput, input));
  });
}

export async function deleteEntriesAction(ids: string[]) {
  return run((db) => deleteEntries(db, parse(idsSchema, ids)));
}

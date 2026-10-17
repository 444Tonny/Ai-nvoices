"use server";

import { parse, run } from "./_run";
import { idSchema } from "@/lib/domain/schemas";
import { pauseTimer, resumeTimer, startTimer, stopTimer } from "@/lib/domain/timer";

export async function startTimerAction(taskId: string) {
  return run((db) => startTimer(db, parse(idSchema, taskId)));
}

export async function pauseTimerAction() {
  return run((db) => pauseTimer(db));
}

export async function resumeTimerAction() {
  return run((db) => resumeTimer(db));
}

export async function stopTimerAction() {
  return run((db) => stopTimer(db));
}

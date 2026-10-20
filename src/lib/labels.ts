import type { InvoiceStatus, TaskPriority, TaskStatus } from "./types";

/** Statuts de tâche, dans l'ordre des colonnes du tableau. */
export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];

export const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: "À faire", color: "#A8A8AE" },
  in_progress: { label: "En cours", color: "#BC6FF1" },
  review: { label: "En revue", color: "#F5A623" },
  done: { label: "Terminé", color: "#2ECC81" },
};

export const TASK_PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];

export const TASK_PRIORITY: Record<TaskPriority, { label: string; color: string; icon: string }> = {
  urgent: { label: "Urgente", color: "#EF4B67", icon: "⚑" },
  high: { label: "Haute", color: "#F5A623", icon: "⚑" },
  normal: { label: "Normale", color: "#A78BDA", icon: "⚑" },
  low: { label: "Basse", color: "#6B6B70", icon: "⚑" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; className: string }> = {
  unpaid: { label: "Non payée", className: "bg-danger/15 text-danger" },
  sent: { label: "Envoyée", className: "bg-warning/15 text-warning" },
  paid: { label: "Payée", className: "bg-success/15 text-success" },
};

/** Couleurs proposées pour les projets (déclinaisons violettes + statuts, jamais de bleu). */
export const PROJECT_COLORS = ["#BC6FF1", "#892CDC", "#A78BDA", "#8368B8", "#6B0FA0", "#2ECC81", "#F5A623", "#EF4B67"];

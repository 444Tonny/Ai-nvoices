export type InvoiceStatus = "unpaid" | "sent" | "paid";
export type TimerStatus = "running" | "paused" | "idle";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type InvoiceItemSource = "manual" | "time";

export interface Client {
  id: string;
  user_id: string;
  created_at: string;
  name: string;
  hourly_rate: number;
  currency: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface Project {
  id: string;
  user_id: string;
  created_at: string;
  name: string;
  description: string | null;
  client_id: string | null;
  color: string;
  /** Taux propre au projet ; null = taux du client. */
  hourly_rate: number | null;
  billable: boolean;
  archived: boolean;
}

export interface ProjectWithClient extends Project {
  client: Pick<Client, "id" | "name" | "hourly_rate" | "currency"> | null;
}

/** Projet enrichi pour les cartes et l'en-tête de page. */
export interface ProjectSummary extends ProjectWithClient {
  /** Taux effectif : projet, sinon client. */
  rate: number;
  currency: string;
  total_seconds: number;
  unbilled_seconds: number;
  unbilled_amount: number;
  task_counts: Record<TaskStatus, number>;
}

export interface Task {
  id: string;
  user_id: string;
  created_at: string;
  name: string;
  description: string | null;
  project_id: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  due_date: string | null;
  estimate_minutes: number | null;
  position: number;
}

/** Tâche enrichie : projet, client, temps total, temps à facturer. */
export interface TaskRow extends Task {
  project: { id: string; name: string; color: string } | null;
  client: { id: string; name: string } | null;
  total_seconds: number;
  unbilled_seconds: number;
  billed_seconds: number;
  last_entry_at: string | null;
  is_running: boolean;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  created_at: string;
  task_id: string;
  start_time: string;
  end_time: string | null;
  description: string | null;
  billable: boolean;
  invoice_item_id: string | null;
}

export interface TimeEntryWithTask extends TimeEntry {
  task: {
    id: string;
    name: string;
    project_name: string | null;
    project_color: string | null;
    client_name: string | null;
  } | null;
  /** Facture qui facture cette entrée, le cas échéant. */
  invoice: { id: string; number: string; status: InvoiceStatus } | null;
}

export interface InvoiceTemplate {
  id: string;
  user_id: string;
  created_at: string;
  name: string;
  company_name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  bank_details: string | null;
  tax_number: string | null;
  logo_url: string | null;
  /** Pied de page prérempli dans les nouvelles factures de ce profil. */
  default_footer_text: string | null;
}

export interface Invoice {
  id: string;
  user_id: string;
  created_at: string;
  number: string;
  client_id: string | null;
  template_id: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  notes: string | null;
  footer_text: string | null;
}

export interface InvoiceRow extends Invoice {
  client: { id: string; name: string } | null;
  total: number;
  subtotal: number;
  item_count: number;
}

export interface InvoiceItem {
  id: string;
  user_id: string;
  created_at: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  task_id: string | null;
  source: InvoiceItemSource;
  position: number;
}

export interface InvoiceItemWithProject extends InvoiceItem {
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  /** Nombre d'entrées de temps facturées par cette ligne. */
  entry_count: number;
}

export interface TimerState {
  status: TimerStatus;
  task: {
    id: string;
    name: string;
    project_name: string | null;
    project_color: string | null;
    client_name: string | null;
  } | null;
  entry_id: string | null;
  entry_start: string | null;
  accumulated_seconds: number;
  server_now: string;
}

export interface ApiToken {
  id: string;
  created_at: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Résultat standard d'une Server Action. */
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export type InvoiceStatus = "unpaid" | "sent" | "paid";
export type TimerStatus = "running" | "paused" | "idle";

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
}

export interface ProjectWithClient extends Project {
  client: Pick<Client, "id" | "name" | "hourly_rate" | "currency"> | null;
}

export interface Task {
  id: string;
  user_id: string;
  created_at: string;
  name: string;
  description: string | null;
  project_id: string | null;
  is_completed: boolean;
}

/** Tâche enrichie : projet, client, temps total et indicateurs. */
export interface TaskRow extends Task {
  project: { id: string; name: string } | null;
  client: { id: string; name: string; hourly_rate: number; currency: string } | null;
  total_seconds: number;
  last_entry_at: string | null;
  is_running: boolean;
  is_invoiced: boolean;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  created_at: string;
  task_id: string;
  start_time: string;
  end_time: string | null;
}

export interface TimeEntryWithTask extends TimeEntry {
  task: { id: string; name: string; project_name: string | null; client_name: string | null } | null;
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
  sync_hours: boolean;
  position: number;
}

export interface InvoiceItemWithProject extends InvoiceItem {
  project_id: string | null;
  project_name: string | null;
}

export interface TimerState {
  status: TimerStatus;
  task: { id: string; name: string; project_name: string | null; client_name: string | null } | null;
  entry_id: string | null;
  entry_start: string | null;
  accumulated_seconds: number;
  server_now: string;
}

/** Résultat standard d'une Server Action. */
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

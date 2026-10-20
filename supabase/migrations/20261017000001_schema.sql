-- =====================================================================
-- AI-nvoices : schéma principal
-- Toutes les tables portent id, user_id, created_at.
-- user_id vaut auth.uid() par défaut : l'app n'a jamais à le fournir.
-- Les clés étrangères sont composites (id, user_id) pour empêcher qu'un
-- utilisateur rattache ses données à des lignes d'un autre utilisateur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  name        text not null check (length(btrim(name)) > 0),
  hourly_rate numeric(12, 2) not null default 0 check (hourly_rate >= 0),
  currency    text not null default 'EUR'
              check (currency in ('EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'MGA', 'XOF')),
  email       text,
  phone       text,
  address     text,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- projects (client facultatif)
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  name        text not null check (length(btrim(name)) > 0),
  description text,
  client_id   uuid,
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id)
);

-- ---------------------------------------------------------------------
-- tasks (projet facultatif)
-- ---------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  name         text not null check (length(btrim(name)) > 0),
  description  text,
  project_id   uuid,
  is_completed boolean not null default false,
  unique (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);

-- ---------------------------------------------------------------------
-- time_entries (end_time null = entrée en cours)
-- ---------------------------------------------------------------------
create table public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  task_id    uuid not null,
  start_time timestamptz not null default now(),
  end_time   timestamptz,
  check (end_time is null or end_time >= start_time),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

-- Un seul timer actif par utilisateur.
create unique index time_entries_one_running_per_user
  on public.time_entries (user_id) where end_time is null;

-- ---------------------------------------------------------------------
-- user_timer_state : mémorise la session de timer (pause / reprise)
-- ---------------------------------------------------------------------
create table public.user_timer_state (
  user_id                     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- tâche de la session en cours (en marche ou en pause)
  session_task_id             uuid references public.tasks (id) on delete set null,
  -- renseigné uniquement quand le timer est en pause
  paused_task_id              uuid references public.tasks (id) on delete set null,
  -- secondes accumulées par les entrées déjà closes de la session
  session_accumulated_seconds numeric(12, 2) not null default 0
);

-- ---------------------------------------------------------------------
-- invoice_templates (profils émetteur)
-- ---------------------------------------------------------------------
create table public.invoice_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  name         text not null check (length(btrim(name)) > 0),
  company_name text not null default '',
  address      text,
  email        text,
  phone        text,
  website      text,
  bank_details text,
  tax_number   text,
  logo_url     text,
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  number       text not null check (length(btrim(number)) > 0),
  client_id    uuid,
  template_id  uuid,
  status       text not null default 'unpaid' check (status in ('unpaid', 'sent', 'paid')),
  invoice_date date not null default current_date,
  issue_date   date,
  due_date     date,
  currency     text not null default 'EUR'
               check (currency in ('EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'MGA', 'XOF')),
  notes        text,
  footer_text  text,
  unique (id, user_id),
  unique (user_id, number),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete set null (client_id),
  foreign key (template_id, user_id) references public.invoice_templates (id, user_id) on delete set null (template_id)
);

-- ---------------------------------------------------------------------
-- invoice_items
-- montant = quantity × unit_price × (1 − discount/100)
-- sync_hours : si vrai (et facture « unpaid »), la quantité suit le temps
-- total de la tâche liée. Les lignes générées depuis une période le
-- désactivent pour conserver les heures de la période.
-- ---------------------------------------------------------------------
create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  invoice_id  uuid not null,
  description text not null default '',
  quantity    numeric(12, 2) not null default 0,
  unit_price  numeric(12, 2) not null default 0,
  discount    numeric(5, 2) not null default 0 check (discount >= 0 and discount <= 100),
  task_id     uuid,
  sync_hours  boolean not null default true,
  position    integer not null default 0,
  foreign key (invoice_id, user_id) references public.invoices (id, user_id) on delete cascade,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------
create index clients_user_idx            on public.clients (user_id, name);
create index projects_user_idx           on public.projects (user_id, name);
create index projects_client_idx         on public.projects (client_id);
create index tasks_user_idx              on public.tasks (user_id, created_at desc);
create index tasks_project_idx           on public.tasks (project_id);
create index time_entries_user_start_idx on public.time_entries (user_id, start_time desc);
create index time_entries_task_idx       on public.time_entries (task_id, start_time desc);
create index invoice_templates_user_idx  on public.invoice_templates (user_id);
create index invoices_user_idx           on public.invoices (user_id, invoice_date desc);
create index invoices_client_idx         on public.invoices (client_id);
create index invoice_items_invoice_idx   on public.invoice_items (invoice_id, position);
create index invoice_items_task_idx      on public.invoice_items (task_id);

-- ---------------------------------------------------------------------
-- Row Level Security : chaque utilisateur ne voit que ses lignes
-- ---------------------------------------------------------------------
alter table public.clients           enable row level security;
alter table public.projects          enable row level security;
alter table public.tasks             enable row level security;
alter table public.time_entries      enable row level security;
alter table public.user_timer_state  enable row level security;
alter table public.invoice_templates enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_items     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'projects', 'tasks', 'time_entries', 'user_timer_state',
    'invoice_templates', 'invoices', 'invoice_items'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end $$;

-- =====================================================================
-- AI-nvoices : restructuration
--  1. Identité : app_uid() = session Supabase OU jeton d'accès personnel
--     (en-tête x-ainv-token, utilisé par le serveur MCP). La RLS s'appuie
--     désormais sur app_uid() : un jeton ne voit que les données de son
--     propriétaire, exactement comme une session.
--  2. Tâches façon ClickUp : statut, priorité, échéance, estimation, ordre.
--  3. Projets : couleur, taux horaire propre, facturable, archivage.
--  4. Facturation façon Clockify : chaque entrée de temps est rattachée à
--     la ligne de facture qui la facture. Le temps « à facturer » est la
--     liste des entrées non rattachées. Une ligne « time » a toujours pour
--     quantité la somme de ses entrées ; les factures envoyées ou payées
--     verrouillent leurs entrées.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Jetons d'accès personnels et identité
-- ---------------------------------------------------------------------
create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  name         text not null check (length(btrim(name)) > 0),
  token_prefix text not null,
  token_hash   text not null unique,
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;
-- Les jetons ne se gèrent que depuis une vraie session (jamais via un jeton).
create policy api_tokens_select_own on public.api_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy api_tokens_insert_own on public.api_tokens for insert to authenticated with check (user_id = (select auth.uid()));
create policy api_tokens_update_own on public.api_tokens for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy api_tokens_delete_own on public.api_tokens for delete to authenticated using (user_id = (select auth.uid()));

-- Utilisateur courant : session Supabase, sinon jeton valide de l'en-tête x-ainv-token.
create or replace function public.app_uid()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    auth.uid(),
    (select t.user_id
       from public.api_tokens t
      where t.revoked_at is null
        and t.token_hash = encode(
              extensions.digest(nullif(current_setting('request.headers', true), '')::json ->> 'x-ainv-token', 'sha256'),
              'hex'))
  )
$$;

-- Validation d'un jeton par le serveur MCP (met à jour la date de dernière utilisation).
create or replace function public.token_whoami()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(
    extensions.digest(nullif(current_setting('request.headers', true), '')::json ->> 'x-ainv-token', 'sha256'), 'hex');
  v_user uuid;
  v_email text;
begin
  if v_hash is null then
    return null;
  end if;
  update public.api_tokens
     set last_used_at = now()
   where token_hash = v_hash and revoked_at is null
  returning user_id into v_user;
  if v_user is null then
    return null;
  end if;
  select email into v_email from auth.users where id = v_user;
  return jsonb_build_object('user_id', v_user, 'email', v_email);
end;
$$;

-- RLS : toutes les tables métier passent par app_uid().
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'projects', 'tasks', 'time_entries', 'user_timer_state',
    'invoice_templates', 'invoices', 'invoice_items'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (user_id = (select public.app_uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (user_id = (select public.app_uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (user_id = (select public.app_uid())) with check (user_id = (select public.app_uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (user_id = (select public.app_uid()))',
      t || '_delete_own', t);
    execute format('alter table public.%I alter column user_id set default public.app_uid()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tâches
-- ---------------------------------------------------------------------
alter table public.tasks
  add column status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done')),
  add column priority text check (priority in ('urgent', 'high', 'normal', 'low')),
  add column due_date date,
  add column estimate_minutes integer check (estimate_minutes is null or estimate_minutes >= 0),
  add column position double precision not null default extract(epoch from clock_timestamp());

update public.tasks t
   set status = case
                  when t.is_completed then 'done'
                  when exists (select 1 from public.time_entries e where e.task_id = t.id) then 'in_progress'
                  else 'todo'
                end,
       position = extract(epoch from t.created_at);

alter table public.tasks drop column is_completed;
create index tasks_status_idx on public.tasks (user_id, status, position);

-- ---------------------------------------------------------------------
-- 3. Projets
-- ---------------------------------------------------------------------
alter table public.projects
  add column color text not null default '#BC6FF1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  add column hourly_rate numeric(12, 2) check (hourly_rate is null or hourly_rate >= 0),
  add column billable boolean not null default true,
  add column archived boolean not null default false;

-- Couleurs distinctes pour les projets existants.
with palette as (
  select array['#BC6FF1', '#2ECC81', '#F5A623', '#A78BDA', '#EF4B67', '#8368B8', '#892CDC'] as colors
), ranked as (
  select p.id, row_number() over (partition by p.user_id order by p.created_at) - 1 as rn from public.projects p
)
update public.projects p
   set color = palette.colors[(ranked.rn % 7) + 1]
  from ranked, palette
 where ranked.id = p.id;

-- ---------------------------------------------------------------------
-- 4. Facturation basée sur les entrées de temps
-- ---------------------------------------------------------------------
alter table public.invoice_items
  add column source text not null default 'manual' check (source in ('manual', 'time')),
  add constraint invoice_items_id_user_key unique (id, user_id);

alter table public.time_entries
  add column description text,
  add column billable boolean not null default true,
  add column invoice_item_id uuid,
  add constraint time_entries_invoice_item_fk
    foreign key (invoice_item_id, user_id) references public.invoice_items (id, user_id)
    on delete set null (invoice_item_id);

create index time_entries_invoice_item_idx on public.time_entries (invoice_item_id);
create index time_entries_unbilled_idx on public.time_entries (user_id, start_time) where invoice_item_id is null;

-- Reprise de l'existant : les lignes synchronisées sur une tâche facturent
-- désormais explicitement les entrées de cette tâche.
update public.time_entries te
   set invoice_item_id = x.item_id
  from (
    select distinct on (ii.task_id) ii.task_id, ii.id as item_id
      from public.invoice_items ii
      join public.invoices i on i.id = ii.invoice_id
     where ii.task_id is not null and ii.sync_hours
     order by ii.task_id, (i.status = 'unpaid') desc, i.invoice_date desc
  ) x
 where te.task_id = x.task_id
   and te.invoice_item_id is null
   and te.end_time is not null;

update public.invoice_items ii
   set source = 'time'
 where exists (select 1 from public.time_entries te where te.invoice_item_id = ii.id);

drop function if exists public.sync_invoice_hours(uuid);
alter table public.invoice_items drop column sync_hours;

-- Quantité d'une ligne « time » = somme de ses entrées (factures non payées uniquement).
create or replace function public.refresh_invoice_item(p_item_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.invoice_items ii
     set quantity = coalesce((
           select round(sum(extract(epoch from (te.end_time - te.start_time))) / 3600, 2)
             from public.time_entries te
            where te.invoice_item_id = ii.id and te.end_time is not null), 0)
   where ii.id = p_item_id
     and ii.source = 'time'
     and exists (select 1 from public.invoices i where i.id = ii.invoice_id and i.status = 'unpaid');
$$;

-- Verrou : le temps d'une facture envoyée ou payée ne bouge plus.
create or replace function public.time_entries_billing_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  if old.invoice_item_id is not null then
    select i.status into v_status
      from public.invoice_items ii
      join public.invoices i on i.id = ii.invoice_id
     where ii.id = old.invoice_item_id;
    if v_status in ('sent', 'paid') then
      if tg_op = 'DELETE'
         or new.start_time is distinct from old.start_time
         or new.end_time is distinct from old.end_time
         or new.task_id is distinct from old.task_id
         or new.billable is distinct from old.billable
         or (new.invoice_item_id is distinct from old.invoice_item_id and new.invoice_item_id is not null) then
        raise exception 'Ce temps figure sur une facture envoyée ou payée : modification impossible.';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger time_entries_billing_guard
  before update or delete on public.time_entries
  for each row execute function public.time_entries_billing_guard();

create or replace function public.time_entries_refresh_items()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.invoice_item_id is not null then
    perform public.refresh_invoice_item(old.invoice_item_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.invoice_item_id is not null
     and (tg_op = 'INSERT' or new.invoice_item_id is distinct from old.invoice_item_id) then
    perform public.refresh_invoice_item(new.invoice_item_id);
  end if;
  return null;
end;
$$;

create trigger time_entries_refresh_items
  after insert or update or delete on public.time_entries
  for each row execute function public.time_entries_refresh_items();

-- Une facture repassée en « non payée » recalcule ses lignes de temps.
create or replace function public.invoices_status_refresh()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'unpaid' and old.status <> 'unpaid' then
    perform public.refresh_invoice_item(ii.id)
       from public.invoice_items ii
      where ii.invoice_id = new.id and ii.source = 'time';
  end if;
  return null;
end;
$$;

create trigger invoices_status_refresh
  after update of status on public.invoices
  for each row execute function public.invoices_status_refresh();

-- Temps à facturer : entrées terminées, facturables, pas encore sur une facture.
-- Taux = taux du projet, sinon taux du client.
create or replace view public.unbilled_entries
with (security_invoker = true) as
select
  te.id         as entry_id,
  te.user_id,
  te.task_id,
  t.name        as task_name,
  t.project_id,
  p.name        as project_name,
  p.color       as project_color,
  p.client_id,
  c.name        as client_name,
  coalesce(c.currency, 'EUR') as currency,
  coalesce(p.hourly_rate, c.hourly_rate, 0)::numeric(12, 2) as rate,
  te.start_time,
  te.end_time,
  extract(epoch from (te.end_time - te.start_time))::numeric(14, 2) as seconds
from public.time_entries te
join public.tasks t on t.id = te.task_id
left join public.projects p on p.id = t.project_id
left join public.clients c on c.id = p.client_id
where te.invoice_item_id is null
  and te.end_time is not null
  and te.billable
  and coalesce(p.billable, true);

-- Prochain numéro libre FAC-AAAA-NNN.
create or replace function public.next_invoice_number()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  with y as (select to_char(current_date, 'YYYY') as yr)
  select 'FAC-' || y.yr || '-' || lpad((coalesce(max((regexp_match(i.number, '^FAC-' || y.yr || '-(\d+)$'))[1]::int), 0) + 1)::text, 3, '0')
    from y
    left join public.invoices i on true
   group by y.yr
$$;

-- Crée une facture vide avec les valeurs par défaut (numéro, profil, devise du client, échéance J+30).
create or replace function public.invoice_create(p_client_id uuid default null, p_currency text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id       uuid;
  v_currency text;
  v_template uuid;
begin
  if public.app_uid() is null then
    raise exception 'Non authentifié';
  end if;
  if p_client_id is not null then
    select currency into v_currency from public.clients where id = p_client_id;
    if not found then
      raise exception 'Client introuvable';
    end if;
  end if;
  select id into v_template from public.invoice_templates order by created_at limit 1;
  insert into public.invoices (number, client_id, template_id, status, invoice_date, issue_date, due_date, currency)
  values (public.next_invoice_number(), p_client_id, v_template, 'unpaid', current_date, current_date, current_date + 30,
          coalesce(p_currency, v_currency, 'EUR'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Ajoute du temps non facturé à une facture non payée : une ligne par tâche
-- (réutilisée si elle existe déjà), entrées rattachées à la ligne.
-- Sans p_task_ids : tout le temps non facturé du client de la facture.
create or replace function public.invoice_add_unbilled(
  p_invoice_id uuid,
  p_task_ids   uuid[] default null,
  p_from       timestamptz default null,
  p_to         timestamptz default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv   public.invoices;
  v_task  record;
  v_item  uuid;
  v_pos   integer;
  v_n     integer;
  v_count integer := 0;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  if v_inv.status <> 'unpaid' then
    raise exception 'Seule une facture non payée peut recevoir du temps.';
  end if;
  if p_task_ids is null and v_inv.client_id is null then
    raise exception 'Précisez les tâches : la facture n''a pas de client.';
  end if;

  select coalesce(max(position), -1) into v_pos from public.invoice_items where invoice_id = p_invoice_id;

  for v_task in
    select u.task_id, min(u.task_name) as task_name, min(u.rate) as rate
      from public.unbilled_entries u
     where (p_task_ids is null or u.task_id = any (p_task_ids))
       and (p_task_ids is not null or u.client_id = v_inv.client_id)
       and (p_from is null or u.start_time >= p_from)
       and (p_to is null or u.start_time < p_to)
     group by u.task_id
     order by min(u.project_name) nulls last, min(u.start_time)
  loop
    v_item := null;
    select id into v_item
      from public.invoice_items
     where invoice_id = p_invoice_id and task_id = v_task.task_id and source = 'time'
     limit 1;
    if v_item is null then
      v_pos := v_pos + 1;
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, discount, task_id, source, position)
      values (p_invoice_id, v_task.task_name, 0, v_task.rate, 0, v_task.task_id, 'time', v_pos)
      returning id into v_item;
    end if;

    update public.time_entries te
       set invoice_item_id = v_item
     where te.id in (
       select u.entry_id
         from public.unbilled_entries u
        where u.task_id = v_task.task_id
          and (p_from is null or u.start_time >= p_from)
          and (p_to is null or u.start_time < p_to));
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Fonctions existantes : identité via app_uid()
-- ---------------------------------------------------------------------
create or replace function public.timer_start(p_task_id uuid)
returns public.time_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := public.app_uid();
  v_entry public.time_entries;
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;
  perform 1 from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tâche introuvable';
  end if;

  update public.time_entries set end_time = now() where user_id = v_user and end_time is null;

  insert into public.time_entries (task_id, start_time) values (p_task_id, now()) returning * into v_entry;

  -- Démarrer une tâche « À faire » la passe « En cours ».
  update public.tasks set status = 'in_progress' where id = p_task_id and status = 'todo';

  insert into public.user_timer_state (user_id, session_task_id, paused_task_id, session_accumulated_seconds, updated_at)
  values (v_user, p_task_id, null, 0, now())
  on conflict (user_id) do update
    set session_task_id = excluded.session_task_id,
        paused_task_id = null,
        session_accumulated_seconds = 0,
        updated_at = now();

  return v_entry;
end;
$$;

create or replace function public.timer_pause()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user    uuid := public.app_uid();
  v_task    uuid;
  v_seconds numeric;
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;

  update public.time_entries
     set end_time = now()
   where user_id = v_user and end_time is null
  returning task_id, extract(epoch from (end_time - start_time)) into v_task, v_seconds;

  if v_task is null then
    return;
  end if;

  insert into public.user_timer_state (user_id, session_task_id, paused_task_id, session_accumulated_seconds, updated_at)
  values (v_user, v_task, v_task, v_seconds, now())
  on conflict (user_id) do update
    set paused_task_id = v_task,
        session_accumulated_seconds = case
          when public.user_timer_state.session_task_id = v_task
            then public.user_timer_state.session_accumulated_seconds + v_seconds
          else v_seconds
        end,
        session_task_id = v_task,
        updated_at = now();
end;
$$;

create or replace function public.timer_resume()
returns public.time_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := public.app_uid();
  v_task  uuid;
  v_entry public.time_entries;
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;

  select paused_task_id into v_task from public.user_timer_state where user_id = v_user;
  if v_task is null then
    raise exception 'Aucun timer en pause';
  end if;

  update public.time_entries set end_time = now() where user_id = v_user and end_time is null;
  insert into public.time_entries (task_id, start_time) values (v_task, now()) returning * into v_entry;
  update public.user_timer_state set paused_task_id = null, updated_at = now() where user_id = v_user;

  return v_entry;
end;
$$;

create or replace function public.timer_stop()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := public.app_uid();
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;
  update public.time_entries set end_time = now() where user_id = v_user and end_time is null;
  delete from public.user_timer_state where user_id = v_user;
end;
$$;

create or replace function public.timer_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user    uuid := public.app_uid();
  v_running public.time_entries;
  v_state   public.user_timer_state;
  v_task_id uuid;
  v_status  text := 'idle';
  v_acc     numeric := 0;
  v_task    jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'idle', 'server_now', now());
  end if;

  select * into v_running from public.time_entries where user_id = v_user and end_time is null limit 1;
  select * into v_state from public.user_timer_state where user_id = v_user;

  if v_running.id is not null then
    v_status := 'running';
    v_task_id := v_running.task_id;
    if v_state.session_task_id = v_running.task_id then
      v_acc := coalesce(v_state.session_accumulated_seconds, 0);
    end if;
  elsif v_state.paused_task_id is not null then
    v_status := 'paused';
    v_task_id := v_state.paused_task_id;
    v_acc := coalesce(v_state.session_accumulated_seconds, 0);
  end if;

  if v_task_id is not null then
    select jsonb_build_object('id', t.id, 'name', t.name, 'project_name', p.name, 'project_color', p.color, 'client_name', c.name)
      into v_task
      from public.tasks t
      left join public.projects p on p.id = t.project_id
      left join public.clients c on c.id = p.client_id
     where t.id = v_task_id;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'task', v_task,
    'entry_id', v_running.id,
    'entry_start', v_running.start_time,
    'accumulated_seconds', v_acc,
    'server_now', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Droits
-- ---------------------------------------------------------------------
grant select on public.task_totals, public.invoice_totals, public.unbilled_entries to anon, authenticated;

grant execute on function public.app_uid()                                          to anon, authenticated;
grant execute on function public.token_whoami()                                     to anon, authenticated;
grant execute on function public.refresh_invoice_item(uuid)                         to anon, authenticated;
grant execute on function public.next_invoice_number()                              to anon, authenticated;
grant execute on function public.invoice_create(uuid, text)                         to anon, authenticated;
grant execute on function public.invoice_add_unbilled(uuid, uuid[], timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.timer_start(uuid)                                  to anon, authenticated;
grant execute on function public.timer_pause()                                      to anon, authenticated;
grant execute on function public.timer_resume()                                     to anon, authenticated;
grant execute on function public.timer_stop()                                       to anon, authenticated;
grant execute on function public.timer_status()                                     to anon, authenticated;
grant execute on function public.dashboard_stats(text, text)                        to anon, authenticated;

-- =====================================================================
-- TimeIsMoney : vues, fonctions du timer, statistiques, facturation
-- Toutes les vues et fonctions s'exécutent avec les droits de l'appelant
-- (security invoker) : les policies RLS s'appliquent donc normalement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Temps total par tâche (l'entrée en cours compte jusqu'à maintenant)
-- ---------------------------------------------------------------------
create or replace view public.task_totals
with (security_invoker = true) as
select
  t.id      as task_id,
  t.user_id as user_id,
  coalesce(sum(extract(epoch from (coalesce(e.end_time, now()) - e.start_time))), 0)::numeric(14, 2) as total_seconds,
  max(e.start_time) as last_entry_at,
  bool_or(e.end_time is null) as is_running
from public.tasks t
left join public.time_entries e on e.task_id = t.id
group by t.id, t.user_id;

-- ---------------------------------------------------------------------
-- Totaux par facture
-- ---------------------------------------------------------------------
create or replace view public.invoice_totals
with (security_invoker = true) as
select
  i.id      as invoice_id,
  i.user_id as user_id,
  coalesce(sum(round(ii.quantity * ii.unit_price, 2)), 0)::numeric(12, 2) as subtotal,
  coalesce(sum(round(ii.quantity * ii.unit_price * (1 - ii.discount / 100), 2)), 0)::numeric(12, 2) as total,
  count(ii.id)::int as item_count
from public.invoices i
left join public.invoice_items ii on ii.invoice_id = i.id
group by i.id, i.user_id;

grant select on public.task_totals, public.invoice_totals to authenticated;

-- ---------------------------------------------------------------------
-- Timer : démarrer une tâche
-- Clôt l'éventuelle entrée en cours puis en ouvre une nouvelle.
-- ---------------------------------------------------------------------
create or replace function public.timer_start(p_task_id uuid)
returns public.time_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_entry public.time_entries;
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;
  perform 1 from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tâche introuvable';
  end if;

  update public.time_entries
     set end_time = now()
   where user_id = v_user and end_time is null;

  insert into public.time_entries (task_id, start_time)
  values (p_task_id, now())
  returning * into v_entry;

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

-- ---------------------------------------------------------------------
-- Timer : pause (clôt l'entrée, mémorise la tâche)
-- ---------------------------------------------------------------------
create or replace function public.timer_pause()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
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

-- ---------------------------------------------------------------------
-- Timer : reprise (nouvelle entrée sur la tâche mise en pause)
-- ---------------------------------------------------------------------
create or replace function public.timer_resume()
returns public.time_entries
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
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

  update public.time_entries
     set end_time = now()
   where user_id = v_user and end_time is null;

  insert into public.time_entries (task_id, start_time)
  values (v_task, now())
  returning * into v_entry;

  update public.user_timer_state
     set paused_task_id = null, updated_at = now()
   where user_id = v_user;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------
-- Timer : stop (clôt l'entrée et vide l'état)
-- ---------------------------------------------------------------------
create or replace function public.timer_stop()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Non authentifié';
  end if;

  update public.time_entries
     set end_time = now()
   where user_id = v_user and end_time is null;

  delete from public.user_timer_state where user_id = v_user;
end;
$$;

-- ---------------------------------------------------------------------
-- Timer : état courant en un seul appel
-- status : 'running' | 'paused' | 'idle'
-- ---------------------------------------------------------------------
create or replace function public.timer_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_running public.time_entries;
  v_state   public.user_timer_state;
  v_task_id uuid;
  v_status  text := 'idle';
  v_acc     numeric := 0;
  v_task    jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'idle');
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
    select jsonb_build_object(
             'id', t.id,
             'name', t.name,
             'project_name', p.name,
             'client_name', c.name)
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
-- Synchronisation des heures des factures « unpaid »
-- Recalcule la quantité des lignes liées à une tâche (sync_hours = true)
-- à partir du temps total de la tâche, arrondi à 2 décimales.
-- Les factures « sent » et « paid » sont figées.
-- ---------------------------------------------------------------------
create or replace function public.sync_invoice_hours(p_invoice_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.invoice_items ii
     set quantity = round(tt.total_seconds / 3600, 2)
    from public.task_totals tt, public.invoices i
   where ii.task_id = tt.task_id
     and i.id = ii.invoice_id
     and i.status = 'unpaid'
     and ii.sync_hours
     and (p_invoice_id is null or ii.invoice_id = p_invoice_id)
     and ii.quantity is distinct from round(tt.total_seconds / 3600, 2);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Statistiques du dashboard
-- p_tz    : fuseau IANA de l'utilisateur (ex. 'Europe/Paris')
-- p_range : 'today' | 'week' | 'month' | 'all' pour les graphiques
-- Les entrées sont découpées aux bornes de chaque période.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats(p_tz text default 'Europe/Paris', p_range text default 'month')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select
      (date_trunc('day',   now() at time zone p_tz)) at time zone p_tz as day_start,
      (date_trunc('week',  now() at time zone p_tz)) at time zone p_tz as week_start,
      (date_trunc('month', now() at time zone p_tz)) at time zone p_tz as month_start
  ),
  r as (
    select case p_range
             when 'today' then b.day_start
             when 'week'  then b.week_start
             when 'month' then b.month_start
             else '-infinity'::timestamptz
           end as range_start
    from b
  ),
  e as (
    select te.task_id, te.start_time as s, coalesce(te.end_time, now()) as en
    from public.time_entries te
  ),
  clipped as (
    select e.task_id,
           greatest(0, extract(epoch from (e.en - greatest(e.s, r.range_start)))) as secs
    from e, r
    where e.en > r.range_start
  ),
  by_task as (
    select coalesce(c.name, 'Sans client') as client_name,
           coalesce(p.name, 'Sans projet') as project_name,
           cl.secs
    from clipped cl
    join public.tasks t on t.id = cl.task_id
    left join public.projects p on p.id = t.project_id
    left join public.clients c on c.id = p.client_id
  )
  select jsonb_build_object(
    'today', (select coalesce(sum(greatest(0, extract(epoch from (e.en - greatest(e.s, b.day_start))))), 0)
                from e, b where e.en > b.day_start),
    'week',  (select coalesce(sum(greatest(0, extract(epoch from (e.en - greatest(e.s, b.week_start))))), 0)
                from e, b where e.en > b.week_start),
    'month', (select coalesce(sum(greatest(0, extract(epoch from (e.en - greatest(e.s, b.month_start))))), 0)
                from e, b where e.en > b.month_start),
    'by_client', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.client_name, 'seconds', x.secs) order by x.secs desc)
      from (select client_name, sum(secs) as secs from by_task group by client_name) x
      where x.secs > 0), '[]'::jsonb),
    'by_project', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.project_name, 'seconds', x.secs) order by x.secs desc)
      from (select project_name, sum(secs) as secs from by_task group by project_name) x
      where x.secs > 0), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Profil émetteur par défaut
-- Créé automatiquement à l'inscription (trigger) et, par sécurité, à la
-- connexion via ensure_default_template() pour les comptes existants.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.invoice_templates (user_id, name, company_name, email)
  values (new.id, 'Profil principal', '', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.ensure_default_template()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not exists (select 1 from public.invoice_templates where user_id = auth.uid()) then
    insert into public.invoice_templates (name, company_name, email)
    values ('Profil principal', '', auth.jwt() ->> 'email');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution : utilisateurs connectés uniquement
-- ---------------------------------------------------------------------
revoke execute on function public.timer_start(uuid)                from public, anon;
revoke execute on function public.timer_pause()                    from public, anon;
revoke execute on function public.timer_resume()                   from public, anon;
revoke execute on function public.timer_stop()                     from public, anon;
revoke execute on function public.timer_status()                   from public, anon;
revoke execute on function public.sync_invoice_hours(uuid)         from public, anon;
revoke execute on function public.dashboard_stats(text, text)      from public, anon;
revoke execute on function public.ensure_default_template()        from public, anon;
revoke execute on function public.handle_new_user()                from public, anon, authenticated;

grant execute on function public.timer_start(uuid)           to authenticated;
grant execute on function public.timer_pause()               to authenticated;
grant execute on function public.timer_resume()              to authenticated;
grant execute on function public.timer_stop()                to authenticated;
grant execute on function public.timer_status()              to authenticated;
grant execute on function public.sync_invoice_hours(uuid)    to authenticated;
grant execute on function public.dashboard_stats(text, text) to authenticated;
grant execute on function public.ensure_default_template()   to authenticated;

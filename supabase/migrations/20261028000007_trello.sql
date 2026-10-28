-- =====================================================================
-- Intégration Trello : chaque carte créée sur un tableau synchronisé
-- devient une tâche AI-nvoices (webhook Trello → /api/integrations/trello).
--
-- - trello_connections : clé API + jeton Trello de l'utilisateur
--   (lisibles uniquement depuis une vraie session, jamais via un jeton MCP).
-- - trello_boards : tableaux synchronisés, projet cible, webhook Trello.
--   Le webhook s'authentifie par un secret dans son URL (SHA-256 en base).
-- - trello_ingest() : security definer appelée par le webhook (anon),
--   crée ou met à jour la tâche liée à la carte.
-- =====================================================================

alter table public.tasks
  add column external_source text,
  add column external_id text,
  add column external_url text;

create unique index tasks_external_uidx
  on public.tasks (user_id, external_source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------
create table public.trello_connections (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  api_key     text not null,
  token       text not null,
  member_name text
);
alter table public.trello_connections enable row level security;
create policy trello_connections_own on public.trello_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
create table public.trello_boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  board_id    text not null,
  board_name  text not null,
  project_id  uuid,
  webhook_id  text,
  secret_hash text not null,
  unique (user_id, board_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);
alter table public.trello_boards enable row level security;
create policy trello_boards_own on public.trello_boards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Nom de liste Trello → statut de tâche (« À faire », « En cours », « Terminé »…).
create or replace function public.trello_list_status(p_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_name is null then null
    when lower(p_name) ~ '\m(done|termin\w*|fini\w*|fait|complet\w*|livr\w*|clos\w*|archiv\w*)\M' then 'done'
    when lower(p_name) ~ '\m(review|revue|relecture|valid\w*|test\w*|qa|feedback|retour\w*)\M' then 'review'
    when lower(p_name) ~ '(en cours|\mdoing\M|progress|\mwip\M|current|\mactif)' then 'in_progress'
    else 'todo'
  end
$$;

-- ---------------------------------------------------------------------
-- Applique une action Trello (format webhook) au tableau p_board.
-- Retourne 'unknown' (tableau ou secret inconnu), 'ignored', 'created' ou 'updated'.
create or replace function public.trello_ingest(p_board uuid, p_secret_hash text, p_action jsonb)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  b         public.trello_boards;
  v_type    text  := p_action->>'type';
  v_data    jsonb := coalesce(p_action->'data', '{}'::jsonb);
  v_card    jsonb := v_data->'card';
  v_card_id text  := v_data->'card'->>'id';
  v_name    text  := left(btrim(coalesce(v_data->'card'->>'name', '')), 500);
  v_status  text;
  v_task    uuid;
begin
  select * into b from public.trello_boards where id = p_board and secret_hash = p_secret_hash;
  if not found then return 'unknown'; end if;

  if v_card_id is null
     or v_type not in ('createCard', 'copyCard', 'convertToCardFromCheckItem', 'moveCardToBoard', 'emailCard', 'updateCard') then
    return 'ignored';
  end if;

  -- Statut : liste d'arrivée (déplacement) ou liste de création ; carte cochée « terminée » → done.
  if v_type <> 'updateCard' or v_data ? 'listAfter' then
    v_status := public.trello_list_status(coalesce(v_data->'listAfter'->>'name', v_data->'list'->>'name'));
  end if;
  if v_card ? 'dueComplete' and (v_card->>'dueComplete')::boolean then
    v_status := 'done';
  end if;

  select id into v_task from public.tasks
   where user_id = b.user_id and external_source = 'trello' and external_id = v_card_id;

  if v_task is null then
    if v_name = '' or coalesce((v_card->>'closed')::boolean, false) then return 'ignored'; end if;
    insert into public.tasks (user_id, project_id, name, description, status, due_date, external_source, external_id, external_url)
    values (
      b.user_id, b.project_id, v_name, nullif(v_card->>'desc', ''), coalesce(v_status, 'todo'),
      (nullif(v_card->>'due', ''))::timestamptz::date,
      'trello', v_card_id,
      case when v_card->>'shortLink' is not null then 'https://trello.com/c/' || (v_card->>'shortLink') end
    )
    on conflict (user_id, external_source, external_id) where external_id is not null do nothing;
    return 'created';
  end if;

  update public.tasks set
    name        = coalesce(nullif(v_name, ''), name),
    description = case when v_card ? 'desc' then nullif(v_card->>'desc', '') else description end,
    due_date    = case when v_card ? 'due' then (nullif(v_card->>'due', ''))::timestamptz::date else due_date end,
    status      = coalesce(v_status, status)
  where id = v_task;
  return 'updated';
end
$$;

revoke execute on function public.trello_ingest(uuid, text, jsonb) from public;
grant execute on function public.trello_ingest(uuid, text, jsonb) to anon, authenticated;

-- =====================================================================
-- AI-nvoices : serveur d'autorisation OAuth 2.1 pour le connecteur MCP
-- (claude.ai, Claude Desktop, mobile).
--  - oauth_clients : clients enregistrés dynamiquement (RFC 7591) ou
--    identifiés par un document de métadonnées (client_id = URL).
--  - oauth_codes   : codes d'autorisation (PKCE S256, 10 minutes, usage unique).
--  - Les jetons d'accès émis sont des lignes d'api_tokens (expirantes,
--    renouvelables) : le serveur MCP et la RLS restent inchangés, et
--    chaque autorisation se révoque depuis Paramètres.
-- Les tables n'ont aucune policy : on n'y accède que par les fonctions
-- security definer ci-dessous. Les secrets ne sont stockés qu'en SHA-256.
-- =====================================================================

create table public.oauth_clients (
  client_id    text primary key,
  created_at   timestamptz not null default now(),
  client_name  text,
  redirect_uris text[] not null,
  secret_hash  text,
  is_metadata_document boolean not null default false
);
alter table public.oauth_clients enable row level security;

create table public.oauth_codes (
  code_hash      text primary key,
  created_at     timestamptz not null default now(),
  client_id      text not null references public.oauth_clients (client_id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  scope          text,
  expires_at     timestamptz not null,
  used_at        timestamptz
);
alter table public.oauth_codes enable row level security;
create index oauth_codes_expires_idx on public.oauth_codes (expires_at);

alter table public.api_tokens
  add column expires_at timestamptz,
  add column oauth_client_id text references public.oauth_clients (client_id) on delete cascade,
  add column refresh_token_hash text unique;

-- ---------------------------------------------------------------------
-- Identité : un jeton expiré n'est plus valide
-- ---------------------------------------------------------------------
create or replace function public.app_uid()
returns uuid language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(
    auth.uid(),
    (select t.user_id from public.api_tokens t
      where t.revoked_at is null
        and (t.expires_at is null or t.expires_at > now())
        and t.token_hash = encode(extensions.digest(nullif(current_setting('request.headers', true), '')::json ->> 'x-ainv-token', 'sha256'), 'hex'))
  )
$$;

create or replace function public.token_whoami()
returns jsonb language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_hash text := encode(extensions.digest(nullif(current_setting('request.headers', true), '')::json ->> 'x-ainv-token', 'sha256'), 'hex');
  v_user uuid;
  v_email text;
begin
  if v_hash is null then return null; end if;
  update public.api_tokens set last_used_at = now()
   where token_hash = v_hash and revoked_at is null and (expires_at is null or expires_at > now())
  returning user_id into v_user;
  if v_user is null then return null; end if;
  select email into v_email from auth.users where id = v_user;
  return jsonb_build_object('user_id', v_user, 'email', v_email);
end;
$$;

-- ---------------------------------------------------------------------
-- Enregistrement d'un client (DCR, ou document de métadonnées)
-- ---------------------------------------------------------------------
create or replace function public.oauth_register_client(
  p_client_id text,
  p_name text,
  p_redirect_uris text[],
  p_secret_hash text,
  p_is_metadata_document boolean default false
)
returns text language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_id  text := coalesce(p_client_id, 'ainv_client_' || encode(extensions.gen_random_bytes(16), 'hex'));
  v_uri text;
begin
  -- Un client_id fourni est forcément l'URL d'un document de métadonnées
  -- (l'application revérifie ce document à chaque autorisation).
  if p_client_id is not null and (p_client_id !~ '^https://' or length(p_client_id) > 500) then
    raise exception 'client_id invalide';
  end if;
  if p_redirect_uris is null or cardinality(p_redirect_uris) = 0 or cardinality(p_redirect_uris) > 10 then
    raise exception 'redirect_uris invalide';
  end if;
  foreach v_uri in array p_redirect_uris loop
    if length(v_uri) > 500 or not (v_uri ~ '^https://' or v_uri ~ '^http://(localhost|127\.0\.0\.1)(:\d+)?/') then
      raise exception 'redirect_uri non autorisée : %', v_uri;
    end if;
  end loop;
  insert into public.oauth_clients (client_id, client_name, redirect_uris, secret_hash, is_metadata_document)
  values (v_id, left(p_name, 200), p_redirect_uris, case when p_client_id is null then p_secret_hash end, p_client_id is not null)
  on conflict (client_id) do update
    set client_name = excluded.client_name,
        redirect_uris = excluded.redirect_uris
    where public.oauth_clients.is_metadata_document;
  return v_id;
end;
$$;

create or replace function public.oauth_get_client(p_client_id text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('client_id', client_id, 'client_name', client_name, 'redirect_uris', to_jsonb(redirect_uris),
                            'has_secret', secret_hash is not null, 'is_metadata_document', is_metadata_document)
    from public.oauth_clients where client_id = p_client_id
$$;

-- ---------------------------------------------------------------------
-- Code d'autorisation (utilisateur connecté qui a donné son accord)
-- ---------------------------------------------------------------------
create or replace function public.oauth_create_code(
  p_code_hash text,
  p_client_id text,
  p_redirect_uri text,
  p_code_challenge text,
  p_scope text
)
returns void language plpgsql volatile security definer set search_path = public
as $$
declare
  v_client public.oauth_clients;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  if not found then raise exception 'Client inconnu'; end if;
  if not (p_redirect_uri = any (v_client.redirect_uris)) then raise exception 'redirect_uri non enregistrée'; end if;
  delete from public.oauth_codes where expires_at < now() - interval '1 day';
  insert into public.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
  values (p_code_hash, p_client_id, auth.uid(), p_redirect_uri, p_code_challenge, p_scope, now() + interval '10 minutes');
end;
$$;

-- ---------------------------------------------------------------------
-- Échange du code contre un jeton (PKCE vérifié)
-- ---------------------------------------------------------------------
create or replace function public.oauth_exchange_code(
  p_code_hash text,
  p_client_id text,
  p_redirect_uri text,
  p_verifier_challenge text,
  p_secret_hash text,
  p_access_hash text,
  p_access_prefix text,
  p_refresh_hash text,
  p_ttl_seconds integer
)
returns jsonb language plpgsql volatile security definer set search_path = public
as $$
declare
  v_client public.oauth_clients;
  v_code   public.oauth_codes;
begin
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  if not found or (v_client.secret_hash is not null and v_client.secret_hash is distinct from p_secret_hash) then
    return jsonb_build_object('error', 'invalid_client');
  end if;
  select * into v_code from public.oauth_codes where code_hash = p_code_hash for update;
  if not found or v_code.used_at is not null or v_code.expires_at < now()
     or v_code.client_id <> p_client_id or v_code.redirect_uri <> p_redirect_uri
     or v_code.code_challenge <> p_verifier_challenge then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  update public.oauth_codes set used_at = now() where code_hash = p_code_hash;
  insert into public.api_tokens (user_id, name, token_prefix, token_hash, expires_at, oauth_client_id, refresh_token_hash)
  values (v_code.user_id, 'Connecteur · ' || coalesce(v_client.client_name, 'OAuth'), p_access_prefix, p_access_hash,
          now() + make_interval(secs => p_ttl_seconds), p_client_id, p_refresh_hash);
  return jsonb_build_object('ok', true, 'scope', coalesce(v_code.scope, 'mcp'));
end;
$$;

-- ---------------------------------------------------------------------
-- Renouvellement (rotation du jeton de rafraîchissement)
-- ---------------------------------------------------------------------
create or replace function public.oauth_refresh(
  p_refresh_hash text,
  p_client_id text,
  p_secret_hash text,
  p_access_hash text,
  p_access_prefix text,
  p_new_refresh_hash text,
  p_ttl_seconds integer
)
returns jsonb language plpgsql volatile security definer set search_path = public
as $$
declare
  v_client public.oauth_clients;
  v_id     uuid;
begin
  select * into v_client from public.oauth_clients where client_id = p_client_id;
  if not found or (v_client.secret_hash is not null and v_client.secret_hash is distinct from p_secret_hash) then
    return jsonb_build_object('error', 'invalid_client');
  end if;
  update public.api_tokens
     set token_hash = p_access_hash,
         token_prefix = p_access_prefix,
         refresh_token_hash = p_new_refresh_hash,
         expires_at = now() + make_interval(secs => p_ttl_seconds)
   where refresh_token_hash = p_refresh_hash
     and oauth_client_id = p_client_id
     and revoked_at is null
  returning id into v_id;
  if v_id is null then return jsonb_build_object('error', 'invalid_grant'); end if;
  return jsonb_build_object('ok', true, 'scope', 'mcp');
end;
$$;

revoke execute on function public.oauth_register_client(text, text, text[], text, boolean) from public;
revoke execute on function public.oauth_get_client(text) from public;
revoke execute on function public.oauth_create_code(text, text, text, text, text) from public, anon;
revoke execute on function public.oauth_exchange_code(text, text, text, text, text, text, text, text, integer) from public;
revoke execute on function public.oauth_refresh(text, text, text, text, text, text, integer) from public;

grant execute on function public.oauth_register_client(text, text, text[], text, boolean) to anon, authenticated;
grant execute on function public.oauth_get_client(text) to anon, authenticated;
grant execute on function public.oauth_create_code(text, text, text, text, text) to authenticated;
grant execute on function public.oauth_exchange_code(text, text, text, text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.oauth_refresh(text, text, text, text, text, text, integer) to anon, authenticated;

-- Gmail G1B.1 private persistence foundation.
-- Local migration only until a separately approved remote db push.

begin;

create schema if not exists private_gmail;
comment on schema private_gmail is 'Private Gmail OAuth and import metadata; never expose through the Data API.';

revoke all on schema private_gmail from public, anon, authenticated;
grant usage on schema private_gmail to service_role;

alter default privileges in schema private_gmail revoke all on tables from public, anon, authenticated;
alter default privileges in schema private_gmail revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private_gmail revoke all on functions from public, anon, authenticated;

create table private_gmail.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_email_hmac text not null check (account_email_hmac ~ '^[0-9a-f]{64}$'),
  masked_email text,
  refresh_token_ciphertext bytea not null,
  refresh_token_nonce bytea not null check (octet_length(refresh_token_nonce) = 12),
  key_version integer not null check (key_version > 0),
  granted_scopes text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'reauth_required', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id),
  unique (id, user_id),
  check ((status = 'revoked' and revoked_at is not null) or status <> 'revoked')
);

create table private_gmail.oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  pkce_verifier_ciphertext bytea not null,
  pkce_nonce bytea not null check (octet_length(pkce_nonce) = 12),
  key_version integer not null check (key_version > 0),
  redirect_uri_hmac text not null check (redirect_uri_hmac ~ '^[0-9a-f]{64}$'),
  return_target text not null check (return_target in ('local', 'staging', 'production')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check (used_at is null or used_at >= created_at)
);

create index gmail_oauth_states_expiry_idx on private_gmail.oauth_states (expires_at) where used_at is null;

create table private_gmail.import_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  message_hmac text not null check (message_hmac ~ '^[0-9a-f]{64}$'),
  status text not null default 'staged' check (status in ('staged', 'committed')),
  import_session_id uuid,
  staged_at timestamptz not null default now(),
  committed_at timestamptz,
  foreign key (connection_id, user_id)
    references private_gmail.connections(id, user_id) on delete cascade,
  foreign key (import_session_id, user_id)
    references public.import_sessions(id, user_id) on delete restrict,
  unique (user_id, connection_id, message_hmac),
  check (
    (status = 'staged' and committed_at is null and import_session_id is null)
    or (status = 'committed' and committed_at is not null and import_session_id is not null)
  )
);

alter table private_gmail.connections enable row level security;
alter table private_gmail.connections force row level security;
alter table private_gmail.oauth_states enable row level security;
alter table private_gmail.oauth_states force row level security;
alter table private_gmail.import_receipts enable row level security;
alter table private_gmail.import_receipts force row level security;

revoke all on all tables in schema private_gmail from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private_gmail to service_role;

create or replace function private_gmail.consume_oauth_state(
  p_state_hash text,
  p_consumed_at timestamptz default now()
)
returns table (
  oauth_state_id uuid,
  owner_user_id uuid,
  pkce_verifier_ciphertext bytea,
  pkce_nonce bytea,
  key_version integer,
  redirect_uri_hmac text,
  return_target text
)
language sql
security definer
set search_path = pg_catalog, private_gmail
as $function$
  update private_gmail.oauth_states as state
  set used_at = p_consumed_at
  where state.state_hash = p_state_hash
    and state.used_at is null
    and state.expires_at > p_consumed_at
  returning
    state.id,
    state.user_id,
    state.pkce_verifier_ciphertext,
    state.pkce_nonce,
    state.key_version,
    state.redirect_uri_hmac,
    state.return_target;
$function$;

revoke all on function private_gmail.consume_oauth_state(text, timestamptz) from public, anon, authenticated;
grant execute on function private_gmail.consume_oauth_state(text, timestamptz) to service_role;

commit;

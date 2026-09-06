-- Allow several intentionally connected Gmail accounts per JobMatch user.
-- Existing single-account rows retain their id, encrypted token and receipts.
begin;

alter table private_gmail.connections
  drop constraint if exists connections_user_id_key;

alter table private_gmail.connections
  add constraint connections_user_account_email_hmac_key unique (user_id, account_email_hmac);

-- A disconnected account keeps its opaque identity and receipts for per-account
-- deduplication, but its locally held refresh token is removed.
alter table private_gmail.connections
  alter column refresh_token_ciphertext drop not null,
  alter column refresh_token_nonce drop not null,
  alter column key_version drop not null;

alter table private_gmail.connections
  add constraint connections_token_presence_matches_status check (
    (status = 'revoked' and refresh_token_ciphertext is null and refresh_token_nonce is null and key_version is null)
    or
    (status in ('active', 'reauth_required') and refresh_token_ciphertext is not null and refresh_token_nonce is not null and key_version is not null)
  );

alter table private_gmail.oauth_states
  add column replace_connection_id uuid,
  add constraint oauth_states_replace_connection_owner_fkey
    foreign key (replace_connection_id, user_id)
    references private_gmail.connections(id, user_id) on delete restrict;

create index gmail_connections_user_state_idx
  on private_gmail.connections (user_id, status, created_at);

-- The original function predates replace_connection_id, so its return shape
-- must be replaced as well. It remains an atomic, service-role-only consume.
drop function if exists private_gmail.consume_oauth_state(text, timestamptz);

create function private_gmail.consume_oauth_state(
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
  return_target text,
  replace_connection_id uuid
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
    state.return_target,
    state.replace_connection_id;
$function$;

revoke all on function private_gmail.consume_oauth_state(text, timestamptz) from public, anon, authenticated;
grant execute on function private_gmail.consume_oauth_state(text, timestamptz) to service_role;

commit;

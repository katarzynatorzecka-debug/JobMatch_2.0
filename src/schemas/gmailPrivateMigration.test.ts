import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20260905191208_gmail_private_foundation.sql?raw'

describe('Gmail private schema migration', () => {
  it('keeps Gmail persistence outside the exposed public schema', () => {
    expect(migration).toContain('create schema if not exists private_gmail')
    expect(migration).toContain('create table private_gmail.connections')
    expect(migration).toContain('create table private_gmail.oauth_states')
    expect(migration).toContain('create table private_gmail.import_receipts')
    expect(migration).not.toContain('create table public.gmail_')
  })

  it('denies client roles and enables defense-in-depth RLS', () => {
    expect(migration).toContain('revoke all on schema private_gmail from public, anon, authenticated')
    expect(migration).toContain('revoke all on all tables in schema private_gmail from public, anon, authenticated')
    expect(migration.match(/enable row level security/g)).toHaveLength(3)
    expect(migration.match(/force row level security/g)).toHaveLength(3)
    expect(migration).not.toMatch(/create policy/i)
  })

  it('stores encrypted tokens, hashed identifiers and no message content', () => {
    expect(migration).toContain('refresh_token_ciphertext bytea')
    expect(migration).toContain('refresh_token_nonce bytea')
    expect(migration).toContain('state_hash text')
    expect(migration).toContain('message_hmac text')
    expect(migration).not.toMatch(/\b(raw|message_body|message_html|access_token)\b/i)
  })

  it('atomically consumes OAuth state through a service-role-only function', () => {
    expect(migration).toContain('create or replace function private_gmail.consume_oauth_state')
    expect(migration).toContain('and state.used_at is null')
    expect(migration).toContain('and state.expires_at > p_consumed_at')
    expect(migration).toContain('set used_at = p_consumed_at')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = pg_catalog, private_gmail')
    expect(migration).toContain('grant execute on function private_gmail.consume_oauth_state(text, timestamptz) to service_role')
  })

  it('distinguishes staged from committed receipts', () => {
    expect(migration).toContain("status text not null default 'staged' check (status in ('staged', 'committed'))")
    expect(migration).toContain("status = 'committed' and committed_at is not null and import_session_id is not null")
    expect(migration).toContain('unique (user_id, connection_id, message_hmac)')
  })
})

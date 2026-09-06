import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20260906114645_gmail_multi_account.sql?raw'

describe('Gmail multi-account migration', () => {
  it('replaces the one-account constraint with a user-and-account identity', () => {
    expect(migration).toContain('drop constraint if exists connections_user_id_key')
    expect(migration).toContain('unique (user_id, account_email_hmac)')
  })

  it('keeps receipts while deleting a disconnected account token', () => {
    expect(migration).toContain('alter column refresh_token_ciphertext drop not null')
    expect(migration).toContain("status = 'revoked' and refresh_token_ciphertext is null")
    expect(migration).not.toContain('delete from private_gmail.import_receipts')
  })

  it('binds a reauthorization state to one owned connection', () => {
    expect(migration).toContain('add column replace_connection_id uuid')
    expect(migration).toContain('foreign key (replace_connection_id, user_id)')
    expect(migration).toContain('references private_gmail.connections(id, user_id)')
    expect(migration).toContain('replace_connection_id uuid')
    expect(migration).toContain('state.replace_connection_id')
  })
})

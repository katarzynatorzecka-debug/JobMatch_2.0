import type { Sql } from 'postgres'
import { base64ToBytes, bytesToBase64 } from './crypto.ts'
import type { GmailConnection, GmailStore, OAuthStateStatus, StoredOAuthState } from './contracts.ts'

type ConnectionRow = {
  id: string
  user_id: string
  masked_email: string | null
  refresh_token_ciphertext: Uint8Array
  refresh_token_nonce: Uint8Array
  key_version: number
  granted_scopes: string[]
  status: GmailConnection['status']
}

function connection(row: ConnectionRow): GmailConnection {
  return {
    id: row.id,
    userId: row.user_id,
    maskedEmail: row.masked_email,
    refreshToken: { ciphertext: bytesToBase64(row.refresh_token_ciphertext), nonce: bytesToBase64(row.refresh_token_nonce), keyVersion: row.key_version },
    grantedScopes: row.granted_scopes,
    status: row.status,
  }
}

export function createPostgresGmailStore(sql: Sql): GmailStore {
  return {
    async createOAuthState(input) {
      await sql`
        insert into private_gmail.oauth_states
          (user_id, state_hash, pkce_verifier_ciphertext, pkce_nonce, key_version, redirect_uri_hmac, return_target, expires_at)
        values
          (${input.userId}::uuid, ${input.stateHash}, ${base64ToBytes(input.pkceVerifier.ciphertext)}, ${base64ToBytes(input.pkceVerifier.nonce)}, ${input.pkceVerifier.keyVersion}, ${input.redirectUriHmac}, ${input.returnTarget}, ${input.expiresAt}::timestamptz)
      `
    },

    async consumeOAuthState(stateHash, consumedAt) {
      const rows = await sql<Array<{
        oauth_state_id: string
        owner_user_id: string
        pkce_verifier_ciphertext: Uint8Array
        pkce_nonce: Uint8Array
        key_version: number
        redirect_uri_hmac: string
        return_target: StoredOAuthState['returnTarget']
      }>>`select * from private_gmail.consume_oauth_state(${stateHash}, ${consumedAt}::timestamptz)`
      const row = rows[0]
      return row ? {
        id: row.oauth_state_id,
        userId: row.owner_user_id,
        pkceVerifier: { ciphertext: bytesToBase64(row.pkce_verifier_ciphertext), nonce: bytesToBase64(row.pkce_nonce), keyVersion: row.key_version },
        redirectUriHmac: row.redirect_uri_hmac,
        returnTarget: row.return_target,
      } : null
    },

    async getOAuthStateStatus(stateHash) {
      const rows = await sql<Array<{ expires_at: Date; used_at: Date | null }>>`
        select expires_at, used_at from private_gmail.oauth_states where state_hash = ${stateHash} limit 1
      `
      const row = rows[0]
      return row ? { expiresAt: row.expires_at.toISOString(), usedAt: row.used_at?.toISOString() ?? null } satisfies OAuthStateStatus : null
    },

    async getConnection(userId) {
      const rows = await sql<ConnectionRow[]>`
        select id, user_id, masked_email, refresh_token_ciphertext, refresh_token_nonce, key_version, granted_scopes, status
        from private_gmail.connections where user_id = ${userId}::uuid limit 1
      `
      return rows[0] ? connection(rows[0]) : null
    },

    async saveConnection(input) {
      await sql`
        insert into private_gmail.connections
          (id, user_id, account_email_hmac, masked_email, refresh_token_ciphertext, refresh_token_nonce, key_version, granted_scopes, status, updated_at, last_used_at, revoked_at)
        values
          (${input.id}::uuid, ${input.userId}::uuid, ${input.accountEmailHmac}, ${input.maskedEmail}, ${base64ToBytes(input.refreshToken.ciphertext)}, ${base64ToBytes(input.refreshToken.nonce)}, ${input.refreshToken.keyVersion}, ${input.grantedScopes}, 'active', now(), now(), null)
        on conflict (user_id) do update set
          account_email_hmac = excluded.account_email_hmac,
          masked_email = excluded.masked_email,
          refresh_token_ciphertext = excluded.refresh_token_ciphertext,
          refresh_token_nonce = excluded.refresh_token_nonce,
          key_version = excluded.key_version,
          granted_scopes = excluded.granted_scopes,
          status = 'active',
          updated_at = now(),
          last_used_at = now(),
          revoked_at = null
      `
    },

    async updateConnectionUse(userId, refreshToken) {
      if (refreshToken) {
        await sql`
          update private_gmail.connections set
            refresh_token_ciphertext = ${base64ToBytes(refreshToken.ciphertext)},
            refresh_token_nonce = ${base64ToBytes(refreshToken.nonce)},
            key_version = ${refreshToken.keyVersion},
            last_used_at = now(),
            updated_at = now()
          where user_id = ${userId}::uuid
        `
        return
      }
      await sql`update private_gmail.connections set last_used_at = now() where user_id = ${userId}::uuid`
    },

    async markReauthRequired(userId) {
      await sql`update private_gmail.connections set status = 'reauth_required', updated_at = now() where user_id = ${userId}::uuid`
    },

    async committedMessageImports(userId, connectionId, hashes) {
      if (!hashes.length) return new Map<string, string>()
      const rows = await sql<Array<{ message_hmac: string; import_session_id: string }>>`
        select message_hmac, import_session_id from private_gmail.import_receipts
        where user_id = ${userId}::uuid and connection_id = ${connectionId}::uuid and status = 'committed' and message_hmac in ${sql(hashes)}
      `
      return new Map(rows.filter((row) => typeof row.import_session_id === 'string').map((row) => [row.message_hmac, row.import_session_id]))
    },

    async stageReceipt(userId, connectionId, messageHash) {
      const inserted = await sql<Array<{ id: string; status: 'staged' | 'committed' }>>`
        insert into private_gmail.import_receipts (user_id, connection_id, message_hmac)
        values (${userId}::uuid, ${connectionId}::uuid, ${messageHash})
        on conflict (user_id, connection_id, message_hmac) do update
          set staged_at = now()
          where private_gmail.import_receipts.status = 'staged'
        returning id, status
      `
      if (inserted[0]) return inserted[0]
      const existing = await sql<Array<{ id: string; status: 'staged' | 'committed' }>>`
        select id, status from private_gmail.import_receipts
        where user_id = ${userId}::uuid and connection_id = ${connectionId}::uuid and message_hmac = ${messageHash}
      `
      if (!existing[0]) throw new Error('GMAIL_RECEIPT_SAVE_FAILED')
      return existing[0]
    },

    async confirmReceipt(userId, receiptId, importSessionId, committedAt) {
      return sql.begin(async (transaction) => {
        const sessions = await transaction<Array<{ id: string }>>`
          select id from public.import_sessions
          where id = ${importSessionId}::uuid and user_id = ${userId}::uuid and status in ('active', 'partial')
          limit 1
        `
        if (!sessions[0]) return false
        const updated = await transaction<Array<{ id: string }>>`
          update private_gmail.import_receipts
          set status = 'committed', import_session_id = ${importSessionId}::uuid, committed_at = ${committedAt}::timestamptz
          where id = ${receiptId}::uuid and user_id = ${userId}::uuid and status = 'staged'
          returning id
        `
        if (updated[0]) return true
        const existing = await transaction<Array<{ id: string }>>`
          select id from private_gmail.import_receipts
          where id = ${receiptId}::uuid and user_id = ${userId}::uuid and status = 'committed' and import_session_id = ${importSessionId}::uuid
        `
        return Boolean(existing[0])
      })
    },

    async deleteConnection(userId) {
      await sql`delete from private_gmail.connections where user_id = ${userId}::uuid`
    },
  }
}

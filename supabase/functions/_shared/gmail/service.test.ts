import { describe, expect, it } from 'vitest'
import { encryptWithKeyRing, hmacSha256Hex } from './crypto'
import { GMAIL_SCOPE, type GmailConnection, type GmailStore, type GoogleGmailGateway, type GoogleMessageMetadata, type GoogleRawMessage, type StoredOAuthState } from './contracts'
import { GmailEdgeError } from './errors'
import { createGmailService } from './service'

const userId = '11111111-1111-4111-8111-111111111111'
const connectionId = '22222222-2222-4222-8222-222222222222'
const importSessionId = '33333333-3333-4333-8333-333333333333'
const receiptBase = '44444444-4444-4444-8444-'
const key = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const keyRing = { activeVersion: 1, keys: { 1: key } }
const fixedNow = new Date('2026-09-05T12:00:00.000Z')
const reportText = 'Example Labs\nWarszawa\nData Analyst\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/example-data'

function encodedRfc822(body = reportText, sender = 'no-reply@rocketjobs.pl') {
  const value = `From: RocketJobs <${sender}>\r\nSubject: Synthetic report\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

class FakeStore implements GmailStore {
  connection: GmailConnection | null = null
  savedUserId: string | null = null
  deletedUserId: string | null = null
  reauthUserId: string | null = null
  rotatedToken: GmailConnection['refreshToken'] | undefined
  validSessions = new Set([importSessionId])
  committed = new Set<string>()
  private states = new Map<string, { value: StoredOAuthState; expiresAt: string; usedAt: string | null }>()
  private receipts = new Map<string, { id: string; status: 'staged' | 'committed'; importSessionId?: string }>()

  async createOAuthState(input: Parameters<GmailStore['createOAuthState']>[0]) {
    this.savedUserId = input.userId
    this.states.set(input.stateHash, { value: { id: crypto.randomUUID(), userId: input.userId, pkceVerifier: input.pkceVerifier, redirectUriHmac: input.redirectUriHmac, returnTarget: input.returnTarget }, expiresAt: input.expiresAt, usedAt: null })
  }

  async consumeOAuthState(stateHash: string, consumedAt: string) {
    const entry = this.states.get(stateHash)
    if (!entry || entry.usedAt || entry.expiresAt <= consumedAt) return null
    entry.usedAt = consumedAt
    return entry.value
  }

  async getOAuthStateStatus(stateHash: string) {
    const entry = this.states.get(stateHash)
    return entry ? { expiresAt: entry.expiresAt, usedAt: entry.usedAt } : null
  }

  async getConnection(requestedUserId: string) {
    return this.connection?.userId === requestedUserId ? this.connection : null
  }

  async saveConnection(input: GmailConnection & { accountEmailHmac: string }) {
    this.savedUserId = input.userId
    this.connection = input
  }

  async markReauthRequired(requestedUserId: string) {
    this.reauthUserId = requestedUserId
    if (this.connection?.userId === requestedUserId) this.connection.status = 'reauth_required'
  }

  async updateConnectionUse(_userId: string, refreshToken?: GmailConnection['refreshToken']) {
    this.rotatedToken = refreshToken
    if (refreshToken && this.connection) this.connection.refreshToken = refreshToken
  }

  async committedMessageImports(_userId: string, _connectionId: string, hashes: string[]) {
    return new Map(hashes.filter((hash) => this.committed.has(hash)).map((hash) => [hash, importSessionId]))
  }

  async stageReceipt(_userId: string, _connectionId: string, messageHash: string) {
    const existing = this.receipts.get(messageHash)
    if (existing) return { id: existing.id, status: existing.status }
    const id = `${receiptBase}${String(this.receipts.size + 1).padStart(12, '0')}`
    const receipt = { id, status: 'staged' as const }
    this.receipts.set(messageHash, receipt)
    return receipt
  }

  async confirmReceipt(_userId: string, receiptId: string, sessionId: string) {
    if (!this.validSessions.has(sessionId)) return false
    const receipt = [...this.receipts.values()].find((value) => value.id === receiptId)
    if (!receipt) return false
    receipt.status = 'committed'
    receipt.importSessionId = sessionId
    return true
  }

  async deleteConnection(requestedUserId: string) {
    this.deletedUserId = requestedUserId
    this.connection = null
  }
}

class FakeGoogle implements GoogleGmailGateway {
  ids = Array.from({ length: 7 }, (_, index) => `message-${index + 1}`)
  listRequest: { query: string; maxResults: 25; pageToken?: string } | null = null
  rawCalls: string[] = []
  metadataCalls: string[] = []
  activeMetadata = 0
  maxMetadata = 0
  activeRaw = 0
  maxRaw = 0
  revokeFails = false
  refreshFails = false
  exchangedCode: string | null = null

  authorizationUrl(input: { state: string; pkceChallenge: string }) {
    const url = new URL('https://accounts.example.test/oauth')
    url.searchParams.set('state', input.state)
    url.searchParams.set('code_challenge', input.pkceChallenge)
    return url.toString()
  }

  async exchangeCode(input: { code: string; pkceVerifier: string }) {
    this.exchangedCode = input.code
    return { accessToken: 'access-token', refreshToken: 'refresh-token', scopes: [GMAIL_SCOPE] }
  }

  async refreshAccessToken() {
    if (this.refreshFails) throw new GmailEdgeError('GMAIL_REAUTH_REQUIRED', 401)
    return 'access-token'
  }

  async getProfile() { return { emailAddress: 'test.user@gmail.com' } }

  async listMessages(_accessToken: string, request: { query: string; maxResults: 25; pageToken?: string }) {
    this.listRequest = request
    return { ids: this.ids, nextPageToken: 'next-page' }
  }

  async getMetadata(_accessToken: string, messageId: string): Promise<GoogleMessageMetadata> {
    this.metadataCalls.push(messageId)
    this.activeMetadata += 1
    this.maxMetadata = Math.max(this.maxMetadata, this.activeMetadata)
    await new Promise((resolve) => setTimeout(resolve, 2))
    this.activeMetadata -= 1
    return { id: messageId, from: 'RocketJobs <no-reply@rocketjobs.pl>', subject: `Report ${messageId.slice(-1)}`, receivedAt: '2026-09-05T10:00:00.000Z', sizeEstimate: 512 }
  }

  async getRaw(_accessToken: string, messageId: string): Promise<GoogleRawMessage> {
    this.rawCalls.push(messageId)
    this.activeRaw += 1
    this.maxRaw = Math.max(this.maxRaw, this.activeRaw)
    await new Promise((resolve) => setTimeout(resolve, 2))
    this.activeRaw -= 1
    return { id: messageId, raw: encodedRfc822(), sizeEstimate: 512 }
  }

  async revoke() {
    if (this.revokeFails) throw new GmailEdgeError('GMAIL_PROVIDER_UNAVAILABLE', 502)
  }
}

async function connectedStore() {
  const store = new FakeStore()
  store.connection = {
    id: connectionId,
    userId,
    maskedEmail: 't***@gmail.com',
    refreshToken: await encryptWithKeyRing('refresh-token', keyRing, [userId, connectionId, 'gmail-refresh-v1']),
    grantedScopes: [GMAIL_SCOPE],
    status: 'active',
  }
  return store
}

function request(path: string, body: Record<string, unknown>, origin = 'http://localhost:5173') {
  return new Request(`https://edge.example.test/${path}`, { method: 'POST', headers: { Authorization: 'Bearer user-token', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

function service(store: FakeStore, google: FakeGoogle) {
  return createGmailService({
    async authenticate(input) {
      if (input.headers.get('Authorization') !== 'Bearer user-token') throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 401)
      return userId
    },
    store,
    google,
    config: {
      redirectUri: 'https://project.example/functions/v1/gmail-oauth-callback',
      returnTargets: { local: 'http://localhost:5173', staging: 'https://staging.example.test', production: 'https://app.example.test' },
      allowedOrigins: new Set(['http://localhost:5173', 'https://staging.example.test', 'https://app.example.test']),
      tokenKeys: keyRing,
      messageHmacKey: key,
    },
    now: () => fixedNow,
    uuid: () => connectionId,
  })
}

describe('Gmail Edge Function service', () => {
  it('binds OAuth state to the authenticated user and redirects without leaking code or tokens', async () => {
    const store = new FakeStore()
    const google = new FakeGoogle()
    const handlers = service(store, google)
    const start = await handlers.oauthStart(request('gmail-oauth-start', { returnTarget: 'local', userId: 'attacker-user' }))
    const authorizationUrl = new URL((await start.json()).authorizationUrl)
    expect(store.savedUserId).toBe(userId)
    const state = authorizationUrl.searchParams.get('state')!
    const callback = await handlers.oauthCallback(new Request(`https://edge.example.test/gmail-oauth-callback?state=${encodeURIComponent(state)}&code=private-code`))
    expect(callback.status).toBe(303)
    expect(callback.headers.get('location')).toBe('http://localhost:5173/import?gmail=connected')
    expect(callback.headers.get('location')).not.toContain('private-code')
    expect(JSON.stringify(store.connection)).not.toContain('refresh-token')
    expect(store.connection?.maskedEmail).toBe('t***@gmail.com')
    const replay = await handlers.oauthCallback(new Request(`https://edge.example.test/gmail-oauth-callback?state=${encodeURIComponent(state)}&code=private-code`))
    expect(replay.headers.get('location')).toContain('GMAIL_OAUTH_STATE_INVALID')
  })

  it('searches metadata with the RocketJobs default, bounded concurrency and opaque references', async () => {
    const store = await connectedStore()
    const google = new FakeGoogle()
    store.committed.add(await hmacSha256Hex('message-1', key))
    const response = await service(store, google).search(request('gmail-search', {}))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(google.listRequest).toEqual({ query: 'from:"no-reply@rocketjobs.pl" newer_than:30d', maxResults: 25 })
    expect(google.rawCalls).toEqual([])
    expect(google.metadataCalls).toHaveLength(7)
    expect(google.maxMetadata).toBeLessThanOrEqual(5)
    expect(payload.messages[0].alreadyImported).toBe(true)
    expect(payload.messages[0].importSessionId).toBe(importSessionId)
    expect(payload.messages[0]).not.toHaveProperty('id')
    expect(payload.messages[0]).not.toHaveProperty('sender')
    expect(JSON.stringify(payload)).not.toContain('message-1')
  })

  it('downloads only selected RAW messages, parses server-side and stages receipts', async () => {
    const store = await connectedStore()
    const google = new FakeGoogle()
    const handlers = service(store, google)
    const search = await handlers.search(request('gmail-search', {}))
    const previews = (await search.json()).messages
    const response = await handlers.importSelected(request('gmail-import-selected', { messageRefs: previews.map((preview: { messageRef: string }) => preview.messageRef) }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(google.rawCalls).toEqual(google.ids)
    expect(google.maxRaw).toBe(5)
    expect(payload.reports).toHaveLength(7)
    expect(payload.reports[0].report.acquisitionChannel).toBe('gmail')
    expect(payload.reports[0].report.offers).toHaveLength(1)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('refresh-token')
    expect(serialized).not.toContain('access-token')
    expect(serialized).not.toContain(encodedRfc822())
    expect(serialized).not.toContain('message-1')
  })

  it('confirms only a receipt paired with an existing user import session', async () => {
    const store = await connectedStore()
    const google = new FakeGoogle()
    const handlers = service(store, google)
    const search = await handlers.search(request('gmail-search', {}))
    const messageRef = (await search.json()).messages[0].messageRef
    const imported = await handlers.importSelected(request('gmail-import-selected', { messageRefs: [messageRef] }))
    const receiptId = (await imported.json()).reports[0].receiptId
    const denied = await handlers.confirmImport(request('gmail-confirm-import', { receiptId, importSessionId: '55555555-5555-4555-8555-555555555555', userId: 'attacker' }))
    expect(denied.status).toBe(409)
    const confirmed = await handlers.confirmImport(request('gmail-confirm-import', { receiptId, importSessionId, userId: 'attacker' }))
    await expect(confirmed.json()).resolves.toEqual({ confirmed: true })
  })

  it('marks invalid grants for reauthentication and deletes the local token after failed revoke', async () => {
    const store = await connectedStore()
    const google = new FakeGoogle()
    google.refreshFails = true
    const failedSearch = await service(store, google).search(request('gmail-search', {}))
    await expect(failedSearch.json()).resolves.toEqual({ code: 'GMAIL_REAUTH_REQUIRED' })
    expect(store.reauthUserId).toBe(userId)

    store.connection = { ...(await connectedStore()).connection! }
    google.refreshFails = false
    google.revokeFails = true
    const disconnected = await service(store, google).disconnect(request('gmail-disconnect', {}))
    await expect(disconnected.json()).resolves.toEqual({ disconnected: true, remoteRevokeSucceeded: false })
    expect(store.deletedUserId).toBe(userId)
    expect(store.connection).toBeNull()
  })

  it('reads a previous encryption key and rewrites the refresh token with the active version', async () => {
    const previousKey = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => 255 - index)))
    const store = new FakeStore()
    store.connection = {
      id: connectionId,
      userId,
      maskedEmail: 't***@gmail.com',
      refreshToken: await encryptWithKeyRing('refresh-token', { activeVersion: 1, keys: { 1: previousKey } }, [userId, connectionId, 'gmail-refresh-v1']),
      grantedScopes: [GMAIL_SCOPE],
      status: 'active',
    }
    const google = new FakeGoogle()
    const handlers = createGmailService({
      authenticate: async () => userId,
      store,
      google,
      config: {
        redirectUri: 'https://project.example/functions/v1/gmail-oauth-callback',
        returnTargets: { local: 'http://localhost:5173', staging: 'https://staging.example.test', production: 'https://app.example.test' },
        allowedOrigins: new Set(['http://localhost:5173']),
        tokenKeys: { activeVersion: 2, keys: { 1: previousKey, 2: key } },
        messageHmacKey: key,
      },
      now: () => fixedNow,
    })
    expect((await handlers.search(request('gmail-search', {}))).status).toBe(200)
    expect(store.rotatedToken?.keyVersion).toBe(2)
    expect(JSON.stringify(store.rotatedToken)).not.toContain('refresh-token')
  })

  it('handles preflight without auth and denies a non-allowlisted browser origin', async () => {
    const store = await connectedStore()
    const handlers = service(store, new FakeGoogle())
    const preflight = await handlers.search(new Request('https://edge.example.test/gmail-search', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    const denied = await handlers.search(request('gmail-search', {}, 'https://attacker.example'))
    expect(denied.status).toBe(403)
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })
})

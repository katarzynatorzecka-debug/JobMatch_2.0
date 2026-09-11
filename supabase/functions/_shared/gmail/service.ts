import { decryptWithKeyRing, encryptWithKeyRing, hmacSha256Hex, sha256Hex, type SecretKeyRing } from './crypto.ts'
import { GMAIL_MAX_MESSAGE_BYTES, GMAIL_MAX_RESULTS, GMAIL_ROCKETJOBS_DEFAULT_SENDER, GMAIL_SCOPE, type GmailConnection, type GmailSearchFilters, type GmailStore, type GoogleGmailGateway, type ImportedReport } from './contracts.ts'
import { gmailCorsHeaders } from './cors.ts'
import { edgeError, errorResponse, GmailEdgeError, jsonResponse } from './errors.ts'
import { mapWithConcurrency } from './limits.ts'
import { createMessageRef, resolveMessageRef } from './messageRef.ts'
import { createOAuthState, oauthStateIsUsable } from './oauthState.ts'
import { buildGmailQuery } from './query.ts'
import { parseGmailRawReport } from './reportParser.ts'

export type GmailServiceConfig = {
  redirectUri: string
  returnTargets: Readonly<Record<'local' | 'staging' | 'production', string>>
  allowedOrigins: ReadonlySet<string>
  tokenKeys: SecretKeyRing
  messageHmacKey: string
}

export type GmailServiceDependencies = {
  authenticate(request: Request): Promise<string>
  store: GmailStore
  google: GoogleGmailGateway
  config: GmailServiceConfig
  now?: () => Date
  uuid?: () => string
}

type AuthenticatedHandler = (request: Request, userId: string) => Promise<Response>

function bodyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readBody(request: Request) {
  try {
    const value: unknown = await request.json()
    if (!bodyObject(value)) throw new Error()
    return value
  } catch {
    throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function maskedEmail(value: string) {
  const [local, domain] = value.trim().toLocaleLowerCase().split('@')
  if (!local || !domain) throw new GmailEdgeError('GMAIL_PROVIDER_UNAVAILABLE', 502)
  return `${local.slice(0, 1)}***@${domain}`
}

async function connectionIdForAccount(userId: string, accountEmailHmac: string) {
  const hash = await sha256Hex(`${userId}:${accountEmailHmac}`)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function senderAddress(value: string) {
  const bracketed = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  const plain = value.match(/(?:^|\s)([^<>\s]+@[^<>\s]+)(?:$|\s)/)
  return (bracketed?.[1] ?? plain?.[1] ?? value).trim().toLocaleLowerCase()
}

function senderLabel(value: string) {
  const address = senderAddress(value)
  if (address === GMAIL_ROCKETJOBS_DEFAULT_SENDER) return 'RocketJobs'
  return maskedEmail(address)
}

function returnLocation(config: GmailServiceConfig, target: 'local' | 'staging' | 'production', result: { connected: true } | { error: string }) {
  const url = new URL('/import', config.returnTargets[target])
  if ('connected' in result) url.searchParams.set('gmail', 'connected')
  else {
    url.searchParams.set('gmail', 'error')
    url.searchParams.set('code', result.error)
  }
  return url.toString()
}

export function createGmailService(dependencies: GmailServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const uuid = dependencies.uuid ?? (() => crypto.randomUUID())

  async function withUser(request: Request, handler: AuthenticatedHandler) {
    let headers: HeadersInit = {}
    try {
      headers = gmailCorsHeaders(request, dependencies.config.allowedOrigins)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 405)
      const userId = await dependencies.authenticate(request)
      return await handler(request, userId)
    } catch (error) {
      return errorResponse(error, headers)
    }
  }

  async function activeConnection(userId: string, connectionId: string) {
    const connection = await dependencies.store.getConnection(userId, connectionId)
    if (!connection) throw new GmailEdgeError('GMAIL_NOT_CONNECTED', 409)
    if (connection.status !== 'active') throw new GmailEdgeError('GMAIL_REAUTH_REQUIRED', 401)
    return connection
  }

  async function accessToken(connection: GmailConnection) {
    const refreshToken = await decryptWithKeyRing(connection.refreshToken, dependencies.config.tokenKeys, [connection.userId, connection.id, 'gmail-refresh-v1'])
    const rotatedToken = connection.refreshToken.keyVersion === dependencies.config.tokenKeys.activeVersion
      ? undefined
      : await encryptWithKeyRing(refreshToken, dependencies.config.tokenKeys, [connection.userId, connection.id, 'gmail-refresh-v1'])
    await dependencies.store.updateConnectionUse(connection.userId, connection.id, rotatedToken)
    try {
      return await dependencies.google.refreshAccessToken(refreshToken)
    } catch (error) {
      const resolved = edgeError(error)
      if (resolved.code === 'GMAIL_REAUTH_REQUIRED') await dependencies.store.markReauthRequired(connection.userId, connection.id)
      throw resolved
    }
  }

  async function oauthStart(request: Request) {
    return withUser(request, async (innerRequest, userId) => {
      const body = await readBody(innerRequest)
      const returnTarget = body.returnTarget
      if (returnTarget !== 'local' && returnTarget !== 'staging' && returnTarget !== 'production') throw new GmailEdgeError('GMAIL_OAUTH_STATE_INVALID', 400)
      const replaceConnectionId = body.connectionId
      if (replaceConnectionId !== undefined && (!validUuid(replaceConnectionId) || !await dependencies.store.getConnection(userId, replaceConnectionId))) {
        throw new GmailEdgeError('GMAIL_OAUTH_STATE_INVALID', 400)
      }
      const state = await createOAuthState(returnTarget, now())
      const pkceVerifier = await encryptWithKeyRing(state.pkceVerifier, dependencies.config.tokenKeys, [userId, state.stateHash, 'gmail-pkce-v1'])
      await dependencies.store.createOAuthState({
        userId,
        stateHash: state.stateHash,
        pkceVerifier,
        redirectUriHmac: await hmacSha256Hex(dependencies.config.redirectUri, dependencies.config.messageHmacKey),
        returnTarget,
        ...(typeof replaceConnectionId === 'string' ? { replaceConnectionId } : {}),
        expiresAt: state.expiresAt,
      })
      return jsonResponse({ authorizationUrl: dependencies.google.authorizationUrl({ state: state.state, pkceChallenge: state.pkceChallenge }) }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
    })
  }

  async function oauthCallback(request: Request) {
    const fallbackTarget: 'local' | 'staging' | 'production' = 'local'
    let errorTarget: 'local' | 'staging' | 'production' = fallbackTarget
    try {
      if (request.method !== 'GET') return errorResponse(new GmailEdgeError('GMAIL_OAUTH_STATE_INVALID', 405))
      const url = new URL(request.url)
      const state = url.searchParams.get('state')
      if (!state) return Response.redirect(returnLocation(dependencies.config, fallbackTarget, { error: 'GMAIL_OAUTH_STATE_INVALID' }), 303)
      const stateHash = await sha256Hex(state)
      const consumed = await dependencies.store.consumeOAuthState(stateHash, now().toISOString())
      if (!consumed) {
        const stateStatus = await dependencies.store.getOAuthStateStatus(stateHash)
        const stateCode = stateStatus && !oauthStateIsUsable(stateStatus, now()) && !stateStatus.usedAt ? 'GMAIL_OAUTH_STATE_EXPIRED' : 'GMAIL_OAUTH_STATE_INVALID'
        return Response.redirect(returnLocation(dependencies.config, fallbackTarget, { error: stateCode }), 303)
      }
      errorTarget = consumed.returnTarget
      const fail = (failureCode: string) => Response.redirect(returnLocation(dependencies.config, consumed.returnTarget, { error: failureCode }), 303)
      if (url.searchParams.get('error') === 'access_denied') return fail('GMAIL_OAUTH_CANCELLED')
      const code = url.searchParams.get('code')
      if (!code) return fail('GMAIL_OAUTH_STATE_INVALID')
      const expectedRedirectHmac = await hmacSha256Hex(dependencies.config.redirectUri, dependencies.config.messageHmacKey)
      if (expectedRedirectHmac !== consumed.redirectUriHmac) throw new GmailEdgeError('GMAIL_OAUTH_STATE_INVALID', 400)
      const verifier = await decryptWithKeyRing(consumed.pkceVerifier, dependencies.config.tokenKeys, [consumed.userId, stateHash, 'gmail-pkce-v1'])
      const tokens = await dependencies.google.exchangeCode({ code, pkceVerifier: verifier })
      if (!tokens.scopes.includes(GMAIL_SCOPE)) throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 403)
      const profile = await dependencies.google.getProfile(tokens.accessToken)
      const accountEmailHmac = await hmacSha256Hex(profile.emailAddress.trim().toLocaleLowerCase(), dependencies.config.messageHmacKey)
      const selected = consumed.replaceConnectionId ? await dependencies.store.getConnection(consumed.userId, consumed.replaceConnectionId) : null
      const existing = await dependencies.store.getConnectionForAccount(consumed.userId, accountEmailHmac)
      if (selected && (selected.accountEmailHmac !== accountEmailHmac || (existing && existing.id !== selected.id))) return fail('GMAIL_OAUTH_ACCOUNT_MISMATCH')
      const connectionId = existing?.id ?? selected?.id ?? await connectionIdForAccount(consumed.userId, accountEmailHmac)
      const encryptedToken = await encryptWithKeyRing(tokens.refreshToken, dependencies.config.tokenKeys, [consumed.userId, connectionId, 'gmail-refresh-v1'])
      await dependencies.store.saveConnection({
        id: connectionId,
        userId: consumed.userId,
        maskedEmail: maskedEmail(profile.emailAddress),
        refreshToken: encryptedToken,
        grantedScopes: tokens.scopes,
        status: 'active',
        accountEmailHmac,
      })
      return Response.redirect(returnLocation(dependencies.config, consumed.returnTarget, { connected: true }), 303)
    } catch (error) {
      return Response.redirect(returnLocation(dependencies.config, errorTarget, { error: edgeError(error).code }), 303)
    }
  }

  async function connectionStatus(request: Request) {
    return withUser(request, async (innerRequest, userId) => {
      const connections = await dependencies.store.listConnections(userId)
      return jsonResponse({ connections: connections.map((connection) => ({ connectionId: connection.id, state: connection.status, ...(connection.maskedEmail ? { maskedEmail: connection.maskedEmail } : {}) })) }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
    })
  }

  async function search(request: Request) {
    return withUser(request, async (innerRequest, userId) => {
      const body = await readBody(innerRequest)
      const filters = body.filters === undefined ? {} : body.filters
      if (!bodyObject(filters)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      if (!validUuid(body.connectionId)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      const connection = await activeConnection(userId, body.connectionId)
      const token = await accessToken(connection)
      const typedFilters = filters as GmailSearchFilters
      const searchRequest = buildGmailQuery({ ...typedFilters, sender: typedFilters.sender?.trim() || GMAIL_ROCKETJOBS_DEFAULT_SENDER })
      const result = await dependencies.google.listMessages(token, searchRequest)
      const metadata = await mapWithConcurrency(result.ids.slice(0, GMAIL_MAX_RESULTS), (messageId) => dependencies.google.getMetadata(token, messageId))
      if (metadata.some((message, index) => message.id !== result.ids[index])) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
      const hashes = await Promise.all(metadata.map((message) => hmacSha256Hex(message.id, dependencies.config.messageHmacKey)))
      const committed = await dependencies.store.committedMessageImports(userId, connection.id, hashes)
      const messages = await Promise.all(metadata.map(async (message, index) => ({
        messageRef: await createMessageRef(message.id, userId, connection.id, dependencies.config.tokenKeys),
        senderLabel: senderLabel(message.from),
        subject: message.subject,
        receivedAt: message.receivedAt,
        sizeEstimate: message.sizeEstimate,
        alreadyImported: committed.has(hashes[index]),
        ...(committed.get(hashes[index]) ? { importSessionId: committed.get(hashes[index]) } : {}),
      })))
      return jsonResponse({ messages, ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}) }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
    })
  }

  async function importSelected(request: Request) {
    return withUser(request, async (innerRequest, userId) => {
      const body = await readBody(innerRequest)
      if (!Array.isArray(body.messageRefs) || !body.messageRefs.every((value) => typeof value === 'string')) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      const references = [...new Set(body.messageRefs.map((value) => (value as string).trim()).filter(Boolean))]
      if (!references.length || references.length > GMAIL_MAX_RESULTS) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      if (!validUuid(body.connectionId)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      const connection = await activeConnection(userId, body.connectionId)
      const resolved = await Promise.all(references.map(async (reference) => ({ reference, messageId: await resolveMessageRef(reference, userId, connection.id, dependencies.config.tokenKeys) })))
      const uniqueMessages = [...new Map(resolved.map((item) => [item.messageId, item])).values()]
      const token = await accessToken(connection)
      const reports = await mapWithConcurrency(uniqueMessages, async ({ reference, messageId }) => {
        const message = await dependencies.google.getRaw(token, messageId)
        if (message.id !== messageId) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
        if (message.sizeEstimate > GMAIL_MAX_MESSAGE_BYTES) throw new GmailEdgeError('GMAIL_MESSAGE_TOO_LARGE', 413)
        const parsed = await parseGmailRawReport(message.raw)
        const messageHash = await hmacSha256Hex(messageId, dependencies.config.messageHmacKey)
        const receipt = await dependencies.store.stageReceipt(userId, connection.id, messageHash)
        if (receipt.status === 'committed') throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 409)
        const report: ImportedReport = {
          version: 2,
          source: 'rocketjobs-gmail',
          reportProvider: 'rocketjobs',
          acquisitionChannel: 'gmail',
          fileName: `gmail-report-${receipt.id}.eml`,
          importedAt: now().toISOString(),
          offers: parsed.offers,
          warnings: [...parsed.warnings, ...parsed.extractionWarnings.map((message) => ({ code: 'partial-parse' as const, message }))],
        }
        return { connectionId: connection.id, receiptId: receipt.id, messageRef: reference, report }
      })
      return jsonResponse({ reports }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
    })
  }

  async function confirmImport(request: Request) {
    return withUser(request, async (innerRequest, userId) => {
      const body = await readBody(innerRequest)
      if (!validUuid(body.connectionId) || !validUuid(body.receiptId) || !validUuid(body.importSessionId)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      const confirmed = await dependencies.store.confirmReceipt(userId, body.connectionId, body.receiptId, body.importSessionId, now().toISOString())
      if (!confirmed) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 409)
      return jsonResponse({ confirmed: true }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
    })
  }

  async function disconnect(request: Request) {
    return withUser(request, async (innerRequest, userId) => {
      const body = await readBody(innerRequest)
      if (!validUuid(body.connectionId)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
      const connection = await dependencies.store.getConnection(userId, body.connectionId)
      if (!connection) return jsonResponse({ disconnected: true, remoteRevokeSucceeded: false }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
      let remoteRevokeSucceeded = false
      try {
        const refreshToken = await decryptWithKeyRing(connection.refreshToken, dependencies.config.tokenKeys, [userId, connection.id, 'gmail-refresh-v1'])
        await dependencies.google.revoke(refreshToken)
        remoteRevokeSucceeded = true
      } catch {
        remoteRevokeSucceeded = false
      } finally {
        await dependencies.store.revokeConnection(userId, connection.id)
      }
      return jsonResponse({ disconnected: true, remoteRevokeSucceeded }, gmailCorsHeaders(innerRequest, dependencies.config.allowedOrigins))
    })
  }

  return { oauthStart, oauthCallback, connectionStatus, search, importSelected, confirmImport, disconnect }
}

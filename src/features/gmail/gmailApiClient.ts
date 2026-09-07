import { validateImportedReport } from '../../schemas/importSchemas'
import { supabase } from '../supabase/client'
import type {
  GmailConfirmImportRequest,
  GmailConnectionStatusResponse,
  GmailConnectionSummary,
  GmailDisconnectResponse,
  GmailEdgeErrorCode,
  GmailEdgeMessagePreview,
  GmailImportSelectedResponse,
  GmailOAuthStartResponse,
  GmailReturnTarget,
  GmailSearchEdgeResponse,
} from './gmailEdgeContracts'
import type { GmailSearchFilters } from './gmailContracts'

type GmailFunctionName = 'gmail-oauth-start' | 'gmail-connection-status' | 'gmail-search' | 'gmail-import-selected' | 'gmail-confirm-import' | 'gmail-disconnect'
type GmailInvokeResult = { data: unknown; error: unknown }
export type GmailApiInvoker = (name: GmailFunctionName, body: Record<string, unknown>) => Promise<GmailInvokeResult>
export type GmailClientErrorCode = GmailEdgeErrorCode | 'GMAIL_CLIENT_UNAVAILABLE' | 'GMAIL_RESPONSE_INVALID'

export class GmailApiError extends Error {
  constructor(public readonly code: GmailClientErrorCode) {
    super(code)
    this.name = 'GmailApiError'
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function responseErrorCode(error: unknown, data: unknown): Promise<GmailClientErrorCode> {
  if (isObject(data) && typeof data.code === 'string') return data.code as GmailClientErrorCode
  const context = isObject(error) ? error.context : null
  if (context && typeof context === 'object' && 'clone' in context && typeof context.clone === 'function') {
    const body: unknown = await (context as Response).clone().json().catch(() => null)
    if (isObject(body) && typeof body.code === 'string') return body.code as GmailClientErrorCode
  }
  return 'GMAIL_CLIENT_UNAVAILABLE'
}

async function defaultInvoker(name: GmailFunctionName, body: Record<string, unknown>): Promise<GmailInvokeResult> {
  if (!supabase) throw new GmailApiError('GMAIL_CLIENT_UNAVAILABLE')
  const { data: { session: storedSession } } = await supabase.auth.getSession()
  if (!storedSession) throw new GmailApiError('GMAIL_PERMISSION_DENIED')
  let session = storedSession
  if (session.expires_at !== undefined && session.expires_at * 1000 <= Date.now() + 60_000) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) throw new GmailApiError('GMAIL_PERMISSION_DENIED')
    session = data.session
  }
  return supabase.functions.invoke(name, { body, headers: { Authorization: `Bearer ${session.access_token}` } })
}

function validConnection(value: unknown): value is GmailConnectionSummary {
  return isObject(value)
    && typeof value.connectionId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.connectionId)
    && (value.state === 'active' || value.state === 'reauth_required')
    && (value.maskedEmail === undefined || typeof value.maskedEmail === 'string')
}

function validConnectionStatus(data: unknown): data is GmailConnectionStatusResponse {
  return isObject(data) && Array.isArray(data.connections) && data.connections.every(validConnection)
}

function validAuthorizationUrl(data: unknown): data is GmailOAuthStartResponse {
  if (!isObject(data) || typeof data.authorizationUrl !== 'string') return false
  try {
    const url = new URL(data.authorizationUrl)
    return url.protocol === 'https:' && url.hostname === 'accounts.google.com'
  } catch {
    return false
  }
}

function validMessagePreview(value: unknown): value is GmailEdgeMessagePreview {
  if (!isObject(value)) return false
  if (typeof value.messageRef !== 'string' || !value.messageRef || value.messageRef.length > 4096) return false
  if (typeof value.senderLabel !== 'string' || value.senderLabel.length > 320) return false
  if (typeof value.subject !== 'string' || value.subject.length > 1000) return false
  if (typeof value.receivedAt !== 'string' || Number.isNaN(Date.parse(value.receivedAt))) return false
  return Number.isInteger(value.sizeEstimate) && Number(value.sizeEstimate) >= 0 && typeof value.alreadyImported === 'boolean' && (value.importSessionId === undefined || (typeof value.importSessionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.importSessionId)))
}

function parseSearch(data: unknown): GmailSearchEdgeResponse | null {
  if (!isObject(data) || !Array.isArray(data.messages) || data.messages.length > 25 || !data.messages.every(validMessagePreview)) return null
  if (data.nextPageToken !== undefined && (typeof data.nextPageToken !== 'string' || data.nextPageToken.length > 2048)) return null
  return {
    messages: data.messages.map((message) => ({
      messageRef: message.messageRef,
      senderLabel: message.senderLabel,
      subject: message.subject,
      receivedAt: message.receivedAt,
      sizeEstimate: message.sizeEstimate,
      alreadyImported: message.alreadyImported,
      ...(typeof message.importSessionId === 'string' ? { importSessionId: message.importSessionId } : {}),
    })),
    ...(typeof data.nextPageToken === 'string' ? { nextPageToken: data.nextPageToken } : {}),
  }
}

function parseImport(data: unknown): GmailImportSelectedResponse | null {
  if (!isObject(data) || !Array.isArray(data.reports) || data.reports.length > 25) return null
  const reports: GmailImportSelectedResponse['reports'] = []
  for (const entry of data.reports) {
    if (!isObject(entry) || typeof entry.connectionId !== 'string' || typeof entry.receiptId !== 'string' || typeof entry.messageRef !== 'string') return null
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.connectionId)) return null
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.receiptId)) return null
    const parsed = validateImportedReport(entry.report)
    if (!parsed.success) return null
    reports.push({ connectionId: entry.connectionId, receiptId: entry.receiptId, messageRef: entry.messageRef, report: parsed.data })
  }
  return { reports }
}

function validDisconnect(data: unknown): data is GmailDisconnectResponse {
  return isObject(data) && data.disconnected === true && typeof data.remoteRevokeSucceeded === 'boolean'
}

export function gmailReturnTargetForLocation(location: Pick<Location, 'hostname'>): GmailReturnTarget {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'local' : 'production'
}

export function createGmailApiClient(invoke: GmailApiInvoker = defaultInvoker) {
  async function call(name: GmailFunctionName, body: Record<string, unknown>) {
    try {
      const result = await invoke(name, body)
      if (result.error) throw new GmailApiError(await responseErrorCode(result.error, result.data))
      return result.data
    } catch (error) {
      if (error instanceof GmailApiError) throw error
      throw new GmailApiError('GMAIL_CLIENT_UNAVAILABLE')
    }
  }

  return {
    async connectionStatus(): Promise<GmailConnectionStatusResponse> {
      const data = await call('gmail-connection-status', {})
      if (!validConnectionStatus(data)) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return { connections: data.connections.map((connection) => ({ connectionId: connection.connectionId, state: connection.state, ...(connection.maskedEmail ? { maskedEmail: connection.maskedEmail } : {}) })) }
    },
    async startOAuth(returnTarget: GmailReturnTarget, connectionId?: string): Promise<GmailOAuthStartResponse> {
      const data = await call('gmail-oauth-start', { returnTarget, ...(connectionId ? { connectionId } : {}) })
      if (!validAuthorizationUrl(data)) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return data
    },
    async search(connectionId: string, filters: GmailSearchFilters): Promise<GmailSearchEdgeResponse> {
      const data = parseSearch(await call('gmail-search', { connectionId, filters }))
      if (!data) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return data
    },
    async importSelected(connectionId: string, messageRefs: string[]): Promise<GmailImportSelectedResponse> {
      const data = parseImport(await call('gmail-import-selected', { connectionId, messageRefs }))
      if (!data) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return data
    },
    async confirmImport(connectionId: string, receiptId: string, importSessionId: string): Promise<void> {
      const body: GmailConfirmImportRequest = { connectionId, receiptId, importSessionId }
      const data = await call('gmail-confirm-import', body)
      if (!isObject(data) || data.confirmed !== true) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
    },
    async disconnect(connectionId: string): Promise<GmailDisconnectResponse> {
      const data = await call('gmail-disconnect', { connectionId })
      if (!validDisconnect(data)) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return { disconnected: true, remoteRevokeSucceeded: data.remoteRevokeSucceeded }
    },
  }
}

export const gmailApiClient = createGmailApiClient()

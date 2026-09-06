import { supabase } from '../supabase/client'
import type {
  GmailConnectionStatusResponse,
  GmailDisconnectResponse,
  GmailEdgeErrorCode,
  GmailOAuthStartResponse,
  GmailReturnTarget,
} from './gmailEdgeContracts'

type GmailFunctionName = 'gmail-oauth-start' | 'gmail-connection-status' | 'gmail-disconnect'
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
  if (isObject(error) && error.context instanceof Response) {
    const body: unknown = await error.context.clone().json().catch(() => null)
    if (isObject(body) && typeof body.code === 'string') return body.code as GmailClientErrorCode
  }
  return 'GMAIL_CLIENT_UNAVAILABLE'
}

async function defaultInvoker(name: GmailFunctionName, body: Record<string, unknown>): Promise<GmailInvokeResult> {
  if (!supabase) throw new GmailApiError('GMAIL_CLIENT_UNAVAILABLE')
  return supabase.functions.invoke(name, { body })
}

function validConnectionStatus(data: unknown): data is GmailConnectionStatusResponse {
  if (!isObject(data) || (data.state !== 'disconnected' && data.state !== 'active' && data.state !== 'reauth_required')) return false
  return data.maskedEmail === undefined || typeof data.maskedEmail === 'string'
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
      return data
    },
    async startOAuth(returnTarget: GmailReturnTarget): Promise<GmailOAuthStartResponse> {
      const data = await call('gmail-oauth-start', { returnTarget })
      if (!validAuthorizationUrl(data)) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return data
    },
    async disconnect(): Promise<GmailDisconnectResponse> {
      const data = await call('gmail-disconnect', {})
      if (!validDisconnect(data)) throw new GmailApiError('GMAIL_RESPONSE_INVALID')
      return data
    },
  }
}

export const gmailApiClient = createGmailApiClient()

import { GMAIL_SCOPE, type GmailSearchRequest, type GoogleGmailGateway, type GoogleMessageMetadata, type GoogleRawMessage } from './contracts.ts'
import { GmailEdgeError } from './errors.ts'

export type GoogleClientConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  authorizationEndpoint?: string
  tokenEndpoint?: string
  gmailApiBase?: string
  revokeEndpoint?: string
  timeoutMs?: number
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function positiveRetryAfter(response: Response) {
  const value = Number(response.headers.get('retry-after'))
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined
}

async function providerFailure(response: Response, allowInvalidGrant = false): Promise<never> {
  const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null
  if (allowInvalidGrant && response.status === 400 && payload?.error === 'invalid_grant') throw new GmailEdgeError('GMAIL_REAUTH_REQUIRED', 401)
  if (response.status === 401) throw new GmailEdgeError('GMAIL_REAUTH_REQUIRED', 401)
  if (response.status === 403) throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 403)
  if (response.status === 429) throw new GmailEdgeError('GMAIL_RATE_LIMITED', 429, positiveRetryAfter(response))
  throw new GmailEdgeError('GMAIL_PROVIDER_UNAVAILABLE', 502)
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value) throw new GmailEdgeError('GMAIL_PROVIDER_UNAVAILABLE', 502)
  return value
}

function validSize(value: unknown) {
  const size = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(size) || size < 0) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
  return size
}

export class GoogleHttpGmailGateway implements GoogleGmailGateway {
  private readonly authorizationEndpoint: string
  private readonly tokenEndpoint: string
  private readonly gmailApiBase: string
  private readonly revokeEndpoint: string
  private readonly timeoutMs: number

  constructor(private readonly config: GoogleClientConfig, private readonly fetcher: Fetcher = fetch) {
    this.authorizationEndpoint = config.authorizationEndpoint ?? 'https://accounts.google.com/o/oauth2/v2/auth'
    this.tokenEndpoint = config.tokenEndpoint ?? 'https://oauth2.googleapis.com/token'
    this.gmailApiBase = config.gmailApiBase ?? 'https://gmail.googleapis.com/gmail/v1'
    this.revokeEndpoint = config.revokeEndpoint ?? 'https://oauth2.googleapis.com/revoke'
    this.timeoutMs = config.timeoutMs ?? 10_000
  }

  private async request(input: string | URL, init: RequestInit = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetcher(input, { ...init, signal: controller.signal })
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') throw new GmailEdgeError('GMAIL_TIMEOUT', 504)
      throw new GmailEdgeError('GMAIL_PROVIDER_UNAVAILABLE', 502)
    } finally {
      clearTimeout(timer)
    }
  }

  authorizationUrl(input: { state: string; pkceChallenge: string }) {
    const url = new URL(this.authorizationEndpoint)
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPE,
      access_type: 'offline',
      prompt: 'select_account consent',
      include_granted_scopes: 'false',
      state: input.state,
      code_challenge: input.pkceChallenge,
      code_challenge_method: 'S256',
    }).toString()
    return url.toString()
  }

  async exchangeCode(input: { code: string; pkceVerifier: string }) {
    const response = await this.request(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: input.code, client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri, grant_type: 'authorization_code', code_verifier: input.pkceVerifier }),
    })
    if (!response.ok) await providerFailure(response)
    const payload = await response.json() as { access_token?: unknown; refresh_token?: unknown; scope?: unknown }
    return {
      accessToken: requiredString(payload.access_token),
      refreshToken: requiredString(payload.refresh_token),
      scopes: typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [],
    }
  }

  async refreshAccessToken(refreshToken: string) {
    const response = await this.request(this.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: refreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: 'refresh_token' }),
    })
    if (!response.ok) await providerFailure(response, true)
    const payload = await response.json() as { access_token?: unknown }
    return requiredString(payload.access_token)
  }

  private async gmailJson(path: string, accessToken: string) {
    const response = await this.request(`${this.gmailApiBase}${path}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
    if (!response.ok) await providerFailure(response)
    return response.json() as Promise<Record<string, unknown>>
  }

  async getProfile(accessToken: string) {
    const payload = await this.gmailJson('/users/me/profile', accessToken)
    return { emailAddress: requiredString(payload.emailAddress) }
  }

  async listMessages(accessToken: string, request: GmailSearchRequest) {
    const query = new URLSearchParams({ q: request.query, maxResults: String(request.maxResults) })
    if (request.pageToken) query.set('pageToken', request.pageToken)
    const payload = await this.gmailJson(`/users/me/messages?${query}`, accessToken)
    const messages = Array.isArray(payload.messages) ? payload.messages : []
    const ids = messages.map((message) => typeof message === 'object' && message && typeof (message as { id?: unknown }).id === 'string' ? (message as { id: string }).id : null).filter((id): id is string => Boolean(id))
    return { ids: ids.slice(0, request.maxResults), ...(typeof payload.nextPageToken === 'string' ? { nextPageToken: payload.nextPageToken } : {}) }
  }

  async getMetadata(accessToken: string, messageId: string): Promise<GoogleMessageMetadata> {
    const query = new URLSearchParams({ format: 'metadata' })
    for (const header of ['From', 'Subject', 'Date']) query.append('metadataHeaders', header)
    const payload = await this.gmailJson(`/users/me/messages/${encodeURIComponent(messageId)}?${query}`, accessToken)
    const headers = typeof payload.payload === 'object' && payload.payload && Array.isArray((payload.payload as { headers?: unknown }).headers) ? (payload.payload as { headers: Array<{ name?: unknown; value?: unknown }> }).headers : []
    const header = (name: string) => headers.find((item) => typeof item.name === 'string' && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.value
    const internalDate = typeof payload.internalDate === 'string' ? Number(payload.internalDate) : Number.NaN
    const received = Number.isFinite(internalDate) ? new Date(internalDate) : new Date(typeof header('Date') === 'string' ? header('Date') as string : Number.NaN)
    if (!Number.isFinite(received.getTime())) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
    return {
      id: requiredString(payload.id),
      from: requiredString(header('From')),
      subject: typeof header('Subject') === 'string' ? header('Subject') as string : '',
      receivedAt: received.toISOString(),
      sizeEstimate: validSize(payload.sizeEstimate),
    }
  }

  async getRaw(accessToken: string, messageId: string): Promise<GoogleRawMessage> {
    const payload = await this.gmailJson(`/users/me/messages/${encodeURIComponent(messageId)}?format=raw`, accessToken)
    return { id: requiredString(payload.id), raw: requiredString(payload.raw), sizeEstimate: validSize(payload.sizeEstimate) }
  }

  async revoke(refreshToken: string) {
    const response = await this.request(this.revokeEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken }) })
    if (!response.ok) await providerFailure(response)
  }
}

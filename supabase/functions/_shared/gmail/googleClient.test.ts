import { describe, expect, it, vi } from 'vitest'
import { GMAIL_SCOPE } from './contracts'
import { GoogleHttpGmailGateway } from './googleClient'

const config = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://project.example/functions/v1/gmail-oauth-callback',
}

describe('Google HTTP Gmail gateway', () => {
  it('builds the fixed readonly OAuth flow with state and PKCE S256', () => {
    const url = new URL(new GoogleHttpGmailGateway(config).authorizationUrl({ state: 'opaque-state', pkceChallenge: 'challenge' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPE)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('state')).toBe('opaque-state')
    expect(url.searchParams.get('code_challenge')).toBe('challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses list, metadata and raw endpoints with bounded parameters', async () => {
    const calls: URL[] = []
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url)
      calls.push(url)
      if (url.pathname.endsWith('/messages')) return Response.json({ messages: [{ id: 'message-1' }], nextPageToken: 'next' })
      if (url.searchParams.get('format') === 'metadata') return Response.json({ id: 'message-1', internalDate: '1788602400000', sizeEstimate: 512, payload: { headers: [{ name: 'From', value: 'RocketJobs <no-reply@rocketjobs.pl>' }, { name: 'Subject', value: 'Raport' }] } })
      return Response.json({ id: 'message-1', raw: 'UkFX', sizeEstimate: 3 })
    })
    const gateway = new GoogleHttpGmailGateway(config, fetcher)
    await expect(gateway.listMessages('access-token', { query: 'newer_than:30d', maxResults: 25, pageToken: 'page' })).resolves.toEqual({ ids: ['message-1'], nextPageToken: 'next' })
    await expect(gateway.getMetadata('access-token', 'message-1')).resolves.toMatchObject({ id: 'message-1', subject: 'Raport', sizeEstimate: 512 })
    await expect(gateway.getRaw('access-token', 'message-1')).resolves.toEqual({ id: 'message-1', raw: 'UkFX', sizeEstimate: 3 })
    expect(calls[0].searchParams.get('maxResults')).toBe('25')
    expect(calls[0].searchParams.get('pageToken')).toBe('page')
    expect(calls[1].searchParams.get('format')).toBe('metadata')
    expect(calls[1].searchParams.getAll('metadataHeaders')).toEqual(['From', 'Subject', 'Date'])
    expect(calls[2].searchParams.get('format')).toBe('raw')
  })

  it('maps invalid grants, rate limits and timeouts to stable errors', async () => {
    const invalidGrant = new GoogleHttpGmailGateway(config, async () => Response.json({ error: 'invalid_grant' }, { status: 400 }))
    await expect(invalidGrant.refreshAccessToken('refresh-token')).rejects.toThrow('GMAIL_REAUTH_REQUIRED')
    const limited = new GoogleHttpGmailGateway(config, async () => Response.json({}, { status: 429, headers: { 'Retry-After': '17' } }))
    await expect(limited.listMessages('access-token', { query: '', maxResults: 25 })).rejects.toMatchObject({ code: 'GMAIL_RATE_LIMITED', retryAfter: 17 })
    const timeout = new GoogleHttpGmailGateway(config, async () => { throw Object.assign(new Error(), { name: 'AbortError' }) })
    await expect(timeout.getProfile('access-token')).rejects.toThrow('GMAIL_TIMEOUT')
    const denied = new GoogleHttpGmailGateway(config, async () => Response.json({}, { status: 403 }))
    await expect(denied.getProfile('access-token')).rejects.toThrow('GMAIL_PERMISSION_DENIED')
    const unavailable = new GoogleHttpGmailGateway(config, async () => Response.json({}, { status: 503 }))
    await expect(unavailable.getProfile('access-token')).rejects.toThrow('GMAIL_PROVIDER_UNAVAILABLE')
  })
})

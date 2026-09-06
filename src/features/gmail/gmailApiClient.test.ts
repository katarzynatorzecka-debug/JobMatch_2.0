import { describe, expect, it, vi } from 'vitest'
import { createGmailApiClient, gmailReturnTargetForLocation, type GmailApiInvoker } from './gmailApiClient'

describe('gmailApiClient', () => {
  it('uses the protected connection endpoint and validates its response', async () => {
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: { state: 'active', maskedEmail: 'k***@gmail.com' }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.connectionStatus()).resolves.toEqual({ state: 'active', maskedEmail: 'k***@gmail.com' })
    expect(invoke).toHaveBeenCalledWith('gmail-connection-status', {})
  })

  it('rejects an authorization URL outside Google Accounts', async () => {
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: { authorizationUrl: 'https://example.test/oauth' }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.startOAuth('local')).rejects.toMatchObject({ code: 'GMAIL_RESPONSE_INVALID' })
  })

  it('preserves a safe Edge Function error code without exposing its response body', async () => {
    const context = new Response(JSON.stringify({ code: 'GMAIL_REAUTH_REQUIRED' }), { status: 401 })
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: null, error: { context } })
    const client = createGmailApiClient(invoke)

    await expect(client.connectionStatus()).rejects.toMatchObject({ code: 'GMAIL_REAUTH_REQUIRED' })
  })

  it('selects the local callback only for a local browser origin', () => {
    expect(gmailReturnTargetForLocation({ hostname: 'localhost' } as Location)).toBe('local')
    expect(gmailReturnTargetForLocation({ hostname: '127.0.0.1' } as Location)).toBe('local')
    expect(gmailReturnTargetForLocation({ hostname: 'jobmatch.example.com' } as Location)).toBe('production')
  })
})

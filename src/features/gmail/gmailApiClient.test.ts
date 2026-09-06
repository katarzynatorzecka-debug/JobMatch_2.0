import { describe, expect, it, vi } from 'vitest'
import { createGmailApiClient, gmailReturnTargetForLocation, type GmailApiInvoker } from './gmailApiClient'

const importedReport = {
  version: 2 as const,
  source: 'rocketjobs-gmail' as const,
  reportProvider: 'rocketjobs' as const,
  acquisitionChannel: 'gmail' as const,
  fileName: 'gmail-report.eml',
  importedAt: '2026-09-06T10:00:00.000Z',
  offers: [{ id: 'offer-123', title: 'Automation Specialist', company: 'Example', missingFields: [], warnings: [] }],
  warnings: [],
}
const connectionId = '123e4567-e89b-42d3-a456-426614174001'

describe('gmailApiClient', () => {
  it('uses the protected connection endpoint and validates its response', async () => {
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: { connections: [{ connectionId, state: 'active', maskedEmail: 'k***@gmail.com' }] }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.connectionStatus()).resolves.toEqual({ connections: [{ connectionId, state: 'active', maskedEmail: 'k***@gmail.com' }] })
    expect(invoke).toHaveBeenCalledWith('gmail-connection-status', {})
  })

  it('keeps separate masked account entries and sends the selected connection to every operation', async () => {
    const secondConnectionId = '123e4567-e89b-42d3-a456-426614174002'
    const invoke = vi.fn<GmailApiInvoker>()
      .mockResolvedValueOnce({ data: { connections: [{ connectionId, state: 'active', maskedEmail: 'a***@gmail.com' }, { connectionId: secondConnectionId, state: 'reauth_required', maskedEmail: 'b***@gmail.com' }] }, error: null })
      .mockResolvedValueOnce({ data: { disconnected: true, remoteRevokeSucceeded: true }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.connectionStatus()).resolves.toEqual({ connections: [{ connectionId, state: 'active', maskedEmail: 'a***@gmail.com' }, { connectionId: secondConnectionId, state: 'reauth_required', maskedEmail: 'b***@gmail.com' }] })
    await client.disconnect(secondConnectionId)
    expect(invoke).toHaveBeenLastCalledWith('gmail-disconnect', { connectionId: secondConnectionId })
  })

  it('rejects an authorization URL outside Google Accounts', async () => {
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: { authorizationUrl: 'https://example.test/oauth' }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.startOAuth('local')).rejects.toMatchObject({ code: 'GMAIL_RESPONSE_INVALID' })
  })

  it('validates preview-only search results and sends filters to the Edge Function', async () => {
    const preview = { messageRef: 'opaque-ref', senderLabel: 'RocketJobs', subject: 'Raport', receivedAt: '2026-09-06T10:00:00.000Z', sizeEstimate: 1024, alreadyImported: false, id: 'private-id', raw: 'private-raw' }
    const safePreview = { messageRef: 'opaque-ref', senderLabel: 'RocketJobs', subject: 'Raport', receivedAt: '2026-09-06T10:00:00.000Z', sizeEstimate: 1024, alreadyImported: false }
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: { messages: [preview], nextPageToken: 'next' }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.search(connectionId, { sender: 'no-reply@rocketjobs.pl' })).resolves.toEqual({ messages: [safePreview], nextPageToken: 'next' })
    expect(invoke).toHaveBeenCalledWith('gmail-search', { connectionId, filters: { sender: 'no-reply@rocketjobs.pl' } })
    expect((await client.search(connectionId, { sender: 'no-reply@rocketjobs.pl' })).messages[0]).not.toHaveProperty('id')
    expect((await client.search(connectionId, { sender: 'no-reply@rocketjobs.pl' })).messages[0]).not.toHaveProperty('raw')
  })

  it('accepts imported reports without RAW or token fields and confirms their receipt', async () => {
    const imported = { connectionId, receiptId: '123e4567-e89b-42d3-a456-426614174000', messageRef: 'opaque-ref', report: { ...importedReport, raw: 'private-raw' }, accessToken: 'private-token' }
    const safeImported = { connectionId, receiptId: imported.receiptId, messageRef: imported.messageRef, report: importedReport }
    const invoke = vi.fn<GmailApiInvoker>()
      .mockResolvedValueOnce({ data: { reports: [imported] }, error: null })
      .mockResolvedValueOnce({ data: { confirmed: true }, error: null })
    const client = createGmailApiClient(invoke)

    await expect(client.importSelected(connectionId, ['opaque-ref'])).resolves.toEqual({ reports: [safeImported] })
    await expect(client.confirmImport(connectionId, imported.receiptId, '223e4567-e89b-42d3-a456-426614174000')).resolves.toBeUndefined()
    expect(safeImported).not.toHaveProperty('accessToken')
    expect(safeImported.report).not.toHaveProperty('raw')
    expect(invoke).toHaveBeenLastCalledWith('gmail-confirm-import', { connectionId, receiptId: imported.receiptId, importSessionId: '223e4567-e89b-42d3-a456-426614174000' })
  })

  it('rejects a search response that exceeds the server-side result contract', async () => {
    const preview = { messageRef: 'opaque-ref', senderLabel: 'RocketJobs', subject: 'Raport', receivedAt: '2026-09-06T10:00:00.000Z', sizeEstimate: 1024, alreadyImported: false }
    const invoke = vi.fn<GmailApiInvoker>().mockResolvedValue({ data: { messages: Array.from({ length: 26 }, () => preview) }, error: null })

    await expect(createGmailApiClient(invoke).search(connectionId, {})).rejects.toMatchObject({ code: 'GMAIL_RESPONSE_INVALID' })
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

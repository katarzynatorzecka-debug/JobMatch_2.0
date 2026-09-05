import { describe, expect, it } from 'vitest'
import { buildRocketJobsGmailSearchRequest } from './gmailQueryBuilder'
import { GMAIL_ALLOWED_RETURN_TARGETS, GMAIL_ROCKETJOBS_DEFAULT_SENDER, type GmailImportedReport, type GmailSearchEdgeResponse } from './gmailEdgeContracts'

describe('Gmail Edge contracts', () => {
  it('uses the approved sender preset without requiring a subject', () => {
    expect(GMAIL_ROCKETJOBS_DEFAULT_SENDER).toBe('no-reply@rocketjobs.pl')
    expect(buildRocketJobsGmailSearchRequest()).toEqual({
      query: 'from:"no-reply@rocketjobs.pl" newer_than:30d',
      maxResults: 25,
    })
  })

  it('allows only fixed OAuth return targets', () => {
    expect(GMAIL_ALLOWED_RETURN_TARGETS).toEqual(['local', 'staging', 'production'])
  })

  it('exposes an opaque reference and presentation-safe sender label in search results', () => {
    const response: GmailSearchEdgeResponse = {
      messages: [{ messageRef: 'opaque-ref', senderLabel: 'RocketJobs', subject: 'Raport', receivedAt: '2026-09-05T12:00:00.000Z', sizeEstimate: 512, alreadyImported: false }],
    }
    expect(response.messages[0]).not.toHaveProperty('id')
    expect(response.messages[0]).not.toHaveProperty('sender')
    expect(response.messages[0].messageRef).toBe('opaque-ref')
  })

  it('keeps RAW and token fields outside the imported-report response contract', () => {
    const response: GmailImportedReport = {
      receiptId: 'receipt-id',
      messageRef: 'opaque-preview-id',
      report: {
        version: 2,
        source: 'rocketjobs-gmail',
        reportProvider: 'rocketjobs',
        acquisitionChannel: 'gmail',
        fileName: 'gmail-report.eml',
        importedAt: '2026-09-05T12:00:00.000Z',
        offers: [],
        warnings: [],
      },
    }
    expect(response).not.toHaveProperty('raw')
    expect(response).not.toHaveProperty('accessToken')
    expect(response).not.toHaveProperty('refreshToken')
  })
})

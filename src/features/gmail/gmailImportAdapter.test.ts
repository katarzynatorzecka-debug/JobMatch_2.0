import { describe, expect, it } from 'vitest'
import { extractRfc822Content } from '../import/emlExtractor'
import { createImportedReport } from '../import/importReportContract'
import { parseRocketJobsReport } from '../import/rocketJobsReportParser'
import { GMAIL_MAX_MESSAGE_BYTES, GmailImportError, type GmailMessagePreview } from './gmailContracts'
import { GmailImportAdapter } from './gmailImportAdapter'
import { MockGmailGateway } from './mockGmailGateway'

const rfc822 = 'From: alerts@rocketjobs.pl\r\nSubject: Synthetic report\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nExample Labs\nWarszawa\nData Analyst\nPozostalo: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/example-data'

function encode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function preview(id: string, sizeEstimate = rfc822.length): GmailMessagePreview {
  return { id, sender: 'alerts@rocketjobs.pl', subject: 'Synthetic report', receivedAt: '2026-09-01T10:00:00.000Z', sizeEstimate, alreadyImported: false }
}

describe('mocked Gmail import adapter', () => {
  it('produces report content equivalent to the same .eml without triggering analysis', async () => {
    const gateway = new MockGmailGateway([{ preview: preview('message-1'), raw: encode(rfc822) }])
    const adapter = new GmailImportAdapter(gateway, () => new Date('2026-09-05T10:00:00.000Z'))
    const gmail = (await adapter.importSelected(['message-1']))[0].report
    const emlExtraction = await extractRfc822Content(new TextEncoder().encode(rfc822).buffer)
    const parsed = parseRocketJobsReport(emlExtraction.text)
    const eml = createImportedReport({ reportProvider: 'rocketjobs', acquisitionChannel: 'eml', fileName: 'report.eml', importedAt: gmail.importedAt, offers: parsed.offers, warnings: [] })

    expect(gmail.acquisitionChannel).toBe('gmail')
    expect(gmail.reportProvider).toBe(eml.reportProvider)
    expect(gmail.offers).toEqual(eml.offers)
    expect(gateway.downloadedMessageIds).toEqual(['message-1'])
  })

  it('never exceeds five parallel message downloads', async () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({ preview: preview(`message-${index}`), raw: encode(rfc822) }))
    const gateway = new MockGmailGateway(messages)
    const imported = await new GmailImportAdapter(gateway).importSelected(messages.map((message) => message.preview.id))
    expect(imported).toHaveLength(8)
    expect(gateway.maxObservedDownloads).toBe(5)
  })

  it('returns controlled errors for missing, invalid, oversized and empty reports', async () => {
    const gateway = new MockGmailGateway([
      { preview: preview('invalid'), raw: '%%%' },
      { preview: preview('oversized', GMAIL_MAX_MESSAGE_BYTES + 1), raw: encode(rfc822) },
      { preview: preview('empty'), raw: encode('Content-Type: text/plain\r\n\r\nNo offers here') },
    ])
    const adapter = new GmailImportAdapter(gateway)
    await expect(adapter.importSelected(['missing'])).rejects.toBeInstanceOf(GmailImportError)
    await expect(adapter.importSelected(['invalid'])).rejects.toThrow('GMAIL_MESSAGE_INVALID')
    await expect(adapter.importSelected(['oversized'])).rejects.toThrow('GMAIL_MESSAGE_TOO_LARGE')
    await expect(adapter.importSelected(['empty'])).rejects.toThrow('GMAIL_REPORT_EMPTY')
  })
})

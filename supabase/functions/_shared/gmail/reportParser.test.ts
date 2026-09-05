import { describe, expect, it } from 'vitest'
import { parseRocketJobsReport } from '../../../../src/features/import/rocketJobsReportParser'
import { parseGmailRawReport, parseRocketJobsText } from './reportParser'

const report = 'Example Labs\nWarszawa\nData Analyst\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/example-data'

function raw(body: string, sender = 'no-reply@rocketjobs.pl', contentType = 'text/plain; charset=UTF-8') {
  const message = `From: RocketJobs <${sender}>\r\nSubject: Synthetic report\r\nContent-Type: ${contentType}\r\n\r\n${body}`
  const bytes = new TextEncoder().encode(message)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

describe('server-side Gmail report parser', () => {
  it('keeps offer output in parity with the existing neutral report parser', () => {
    expect(parseRocketJobsText(report)).toEqual(parseRocketJobsReport(report))
  })

  it('parses text and HTML-only RFC822 without returning message content', async () => {
    const text = await parseGmailRawReport(raw(report))
    const html = await parseGmailRawReport(raw(`<html><body>Example Labs<br>Warszawa<br>Data Analyst<br>Pozostało: 2 dni<br><a href="https://rocketjobs.pl/oferta-pracy/example-data">Oferta</a></body></html>`, 'no-reply@rocketjobs.pl', 'text/html; charset=UTF-8'))
    expect(text.offers).toEqual(parseRocketJobsReport(report).offers)
    expect(html.offers).toEqual(parseRocketJobsReport(report).offers)
    expect(text).not.toHaveProperty('raw')
    expect(text).not.toHaveProperty('text')
  })

  it('rejects unsupported senders, invalid RAW and reports without supported offers', async () => {
    await expect(parseGmailRawReport(raw(report, 'attacker@example.com'))).rejects.toThrow('GMAIL_MESSAGE_INVALID')
    await expect(parseGmailRawReport('%%%')).rejects.toThrow('GMAIL_MESSAGE_INVALID')
    await expect(parseGmailRawReport(raw('No supported offer here'))).rejects.toThrow('GMAIL_REPORT_EMPTY')
  })

  it('ignores attachments in multipart messages', async () => {
    const message = [
      'From: RocketJobs <no-reply@rocketjobs.pl>',
      'Subject: Synthetic report',
      'Content-Type: multipart/mixed; boundary="jobmatch-boundary"',
      '',
      '--jobmatch-boundary',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      report,
      '--jobmatch-boundary',
      'Content-Type: application/octet-stream',
      'Content-Disposition: attachment; filename="private.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      'cHJpdmF0ZS1hdHRhY2htZW50',
      '--jobmatch-boundary--',
    ].join('\r\n')
    const bytes = new TextEncoder().encode(message)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const parsed = await parseGmailRawReport(btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, ''))
    expect(parsed.offers).toHaveLength(1)
    expect(JSON.stringify(parsed)).not.toContain('private-attachment')
  })
})

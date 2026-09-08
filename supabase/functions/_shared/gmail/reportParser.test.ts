import { describe, expect, it } from 'vitest'
import { parseRocketJobsReport } from '../../../../src/features/import/rocketJobsReportParser'
import { parseGmailRawReport, parseRocketJobsText } from './reportParser'

const report = 'Example Labs\nWarszawa\nData Analyst\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/example-data'
const newsletterHeaderAndOffer = '**Twoje preferencje: ai, Najlepiej dopasowane, Od wczoraj**96 · RocketJobs · Mamy dla Ciebie nowe oferty\nhttps://rocketjobs.pl/oferta-pracy/newsletter-header\n\nExample Labs\nWarszawa\nData Analyst\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/example-data'
const currentLayoutWithoutElapsedTime = '**Twoje preferencje: ai, Najlepiej dopasowane, Od wczoraj**\nhttps://rocketjobs.pl/oferta-pracy/newsletter-header\n\nExample Labs\nWarszawa\nData Analyst\nPraca hybrydowa\nhttps://rocketjobs.pl/oferta-pracy/example-data'
const reportWithLocationsAndUnavailableSalary = '96 · RocketJobs · Armiger sp. z o.o.\nKatowice\nCustomer Success Manager\nBrak widełek wynagrodzenia\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/armiger-customer-success-manager-katowice\n\nKAMSOFT S.A.\nKatowice\nSenior Implementation Specialist\nBrak widełek wynagrodzenia\nPraca hybrydowa\nUmowa o pracę\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/kamsoft-senior-implementation-specialist-katowice\n\nEnergomix S.A.\nPłock\nProject Manager\nBrak widełek wynagrodzenia\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/energomix-project-manager-plock\n\nEduGO P.S.A.\nSopot\nEducation Project Manager\nPraca hybrydowa\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/edugo-education-project-manager-sopot'
const reportWithRocketJobsChrome = '96\nRocketJobs\nTMS Personal\nGdańsk\nBądź pierwszym aplikującym!\nRecruitment Coordinator\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/tms-personal-recruitment-coordinator-gdansk'
const reportWithEmbeddedWorkMode = 'EduGO P.S.A.\nSopot\nBądź pierwszym aplikującym!\nInstruktor / Instruktorka tworzenia gier - firma edukacyjna, 100% zdalnie\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta-pracy/edugo-instruktor-tworzenia-gier-sopot'
const multiLocationCard = 'Tagvenue <https://rocket.pl/?utm_source=internal-email>\nAdmind\nKatowice\nZbuduj swoją karierę od Doradcy do Managera Sprzedaży\nSystems & Automation Specialist\nPraca w pełni zdalna\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta/admind-systems-automation-specialist-krakow-bi-data'

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

  it('ignores a newsletter header link while preserving the following offer card', async () => {
    expect(parseRocketJobsText(newsletterHeaderAndOffer)).toEqual(parseRocketJobsReport(newsletterHeaderAndOffer))
    const parsed = await parseGmailRawReport(raw(newsletterHeaderAndOffer))
    expect(parsed.offers).toHaveLength(1)
    expect(parsed.offers[0]).toMatchObject({ title: 'Data Analyst', company: 'Example Labs' })
    expect(parsed.offers[0]?.title).not.toContain('Twoje preferencje')
  })

  it('parses the current compact card layout without an elapsed-time line', async () => {
    expect(parseRocketJobsText(currentLayoutWithoutElapsedTime).offers).toMatchObject([{ title: 'Data Analyst', company: 'Example Labs' }])
    const parsed = await parseGmailRawReport(raw(currentLayoutWithoutElapsedTime))
    expect(parsed.offers).toMatchObject([{ title: 'Data Analyst', company: 'Example Labs' }])
  })

  it('keeps Gmail title, company, location and optional fields aligned for current report cards', async () => {
    const expected = parseRocketJobsReport(reportWithLocationsAndUnavailableSalary)
    expect(parseRocketJobsText(reportWithLocationsAndUnavailableSalary)).toEqual(expected)
    await expect(parseGmailRawReport(raw(reportWithLocationsAndUnavailableSalary))).resolves.toMatchObject({ offers: expected.offers })
  })

  it('keeps RocketJobs chrome out of Gmail offer titles', async () => {
    const expected = parseRocketJobsReport(reportWithRocketJobsChrome)
    expect(parseRocketJobsText(reportWithRocketJobsChrome)).toEqual(expected)
    await expect(parseGmailRawReport(raw(reportWithRocketJobsChrome))).resolves.toMatchObject({ offers: expected.offers })
  })

  it('keeps embedded work mode separate from a Gmail offer title and location', async () => {
    const expected = parseRocketJobsReport(reportWithEmbeddedWorkMode)
    expect(parseRocketJobsText(reportWithEmbeddedWorkMode)).toEqual(expected)
    await expect(parseGmailRawReport(raw(reportWithEmbeddedWorkMode))).resolves.toMatchObject({ offers: expected.offers })
  })

  it('keeps multi-location links canonical and excludes marketing or linked card chrome', async () => {
    const expected = parseRocketJobsReport(multiLocationCard)
    expect(expected.offers).toMatchObject([{ title: 'Systems & Automation Specialist', company: 'Admind', location: 'Katowice', sourceUrl: 'https://rocketjobs.pl/oferta-pracy/admind-systems-automation-specialist-krakow-bi-data' }])
    expect(parseRocketJobsText(multiLocationCard)).toEqual(expected)
    await expect(parseGmailRawReport(raw(multiLocationCard))).resolves.toMatchObject({ offers: expected.offers })
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

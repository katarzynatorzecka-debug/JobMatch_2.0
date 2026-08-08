import { describe, expect, it } from 'vitest'
import { createUrlOfferSeed, importedReportFromUrlSource, normalizeOfferUrl } from './urlOfferImport'

describe('URL offer import adapter', () => {
  it('accepts HTTPS and removes fragments for stable reuse', () => {
    expect(normalizeOfferUrl(' https://rocketjobs.pl/oferta-pracy/example#apply ')).toBe('https://rocketjobs.pl/oferta-pracy/example')
    expect(normalizeOfferUrl('http://rocketjobs.pl/oferta-pracy/example')).toBeNull()
  })

  it('creates one report compatible with the existing import pipeline', () => {
    const url = 'https://rocketjobs.pl/oferta-pracy/example'
    const seed = createUrlOfferSeed(url)
    const report = importedReportFromUrlSource({ offerId: seed.id, sourceUrl: url, status: 'completed', sourceQuality: 'full', title: 'Automation Specialist', company: 'Example', requirements: [], responsibilities: [], benefits: [], missingInformation: [], warnings: [], fetchedAt: '2026-08-08T10:00:00.000Z' }, url)
    expect(report.source).toBe('job-url')
    expect(report.offers).toHaveLength(1)
    expect(report.offers[0]).toMatchObject({ id: seed.id, title: 'Automation Specialist', company: 'Example', sourceUrl: url })
  })
})

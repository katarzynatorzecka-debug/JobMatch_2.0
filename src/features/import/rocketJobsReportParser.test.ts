import { describe, expect, it } from 'vitest'
import { parseRocketJobsReport } from './rocketJobsReportParser'

const report = `RocketJobs\nExample Labs\nWarszawa\nData Automation Specialist\n120–150 PLN/h\nPraca zdalna\nUmowa B2B\nPozostało: 5 dni\nhttps://rocketjobs.pl/oferta/example-data-automation\n\nNorthstar\nGdańsk\nProduct Analyst\nPraca hybrydowa\nUmowa o pracę\nPozostało: 3 dni\nhttps://rocketjobs.pl/oferta/northstar-product-analyst`

describe('parseRocketJobsReport', () => {
  it('extracts normalized offers from anonymous RocketJobs snippets', () => {
    const parsed = parseRocketJobsReport(report)
    expect(parsed.offers).toHaveLength(2)
    expect(parsed.offers[0]).toMatchObject({ title: 'Data Automation Specialist', company: 'Example Labs', sourceLabel: 'RocketJobs' })
    expect(parsed.offers[1].missingFields).toContain('wynagrodzenie')
  })
  it('deduplicates the same source URL deterministically', () => {
    const parsed = parseRocketJobsReport(`${report}\n${report}`)
    expect(parsed.offers).toHaveLength(2)
    expect(parsed.warnings.some((warning) => warning.code === 'duplicate')).toBe(true)
  })

  it('repairs legacy report URLs before storing an offer', () => {
    const parsed = parseRocketJobsReport(`Example Labs\nWarszawa\nSEO Specialist\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta/example-seo?utm_campaign=no-category?utm_source=mail`)
    expect(parsed.offers[0]?.sourceUrl).toBe('https://rocketjobs.pl/oferta-pracy/example-seo?utm_campaign=no-category&utm_source=mail')
  })

  it('uses the recognized location when repairing a legacy report URL', () => {
    const parsed = parseRocketJobsReport(`Internet Plus\nPoznań\nMłodszy Specjalista SEO\nPozostało: 2 dni\nhttps://rocketjobs.pl/oferta/internet-plus-seo-kielce-marketing-marketing`)
    expect(parsed.offers[0]?.sourceUrl).toBe('https://rocketjobs.pl/oferta-pracy/internet-plus-seo-poznan-marketing-marketing')
  })
})

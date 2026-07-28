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
})

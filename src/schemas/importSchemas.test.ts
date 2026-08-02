import { describe, expect, it } from 'vitest'
import { validateImportedReport } from './importSchemas'

function report(importedAt: string) {
  return {
    version: 1,
    source: 'rocketjobs-eml',
    fileName: 'synthetic-report.eml',
    importedAt,
    offers: [{ id: 'synthetic-offer-001', title: 'Synthetic Analyst', company: 'Northstar Demo Labs', missingFields: [], warnings: [] }],
    warnings: [],
  }
}

describe('validateImportedReport timestamps', () => {
  it('accepts a UTC timestamp ending in Z', () => {
    expect(validateImportedReport(report('2026-08-01T09:10:00.000Z')).success).toBe(true)
  })

  it('accepts a timestamp returned by Supabase with a UTC offset', () => {
    expect(validateImportedReport(report('2026-08-01T09:10:00+00:00')).success).toBe(true)
  })

  it('rejects an invalid timestamp', () => {
    expect(validateImportedReport(report('not-a-timestamp')).success).toBe(false)
  })
})

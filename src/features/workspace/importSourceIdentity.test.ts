import { describe, expect, it } from 'vitest'
import { createImportedReport } from '../import/importReportContract'
import { toWorkspaceImportInput } from './workspaceRepository'

const offer = { id: 'offer-synthetic-1', title: 'Data Analyst', company: 'Example Labs', location: 'Warszawa', missingFields: [], warnings: [] }

describe('cross-channel import identity', () => {
  it('keeps acquisition channels separate while using provider identity for deduplication', () => {
    const common = { reportProvider: 'rocketjobs' as const, fileName: 'report.eml', importedAt: '2026-09-05T10:00:00.000Z', offers: [offer], warnings: [] }
    const eml = toWorkspaceImportInput('user-1', createImportedReport({ ...common, acquisitionChannel: 'eml' }))
    const gmail = toWorkspaceImportInput('user-1', createImportedReport({ ...common, acquisitionChannel: 'gmail' }))
    expect(eml.sourceType).toBe('rocketjobs-eml')
    expect(gmail.sourceType).toBe('rocketjobs-gmail')
    expect(eml).toMatchObject({ reportProvider: 'rocketjobs', acquisitionChannel: 'eml' })
    expect(gmail).toMatchObject({ reportProvider: 'rocketjobs', acquisitionChannel: 'gmail' })
    expect(eml.items[0].canonicalFingerprint).toBe(gmail.items[0].canonicalFingerprint)
  })
})

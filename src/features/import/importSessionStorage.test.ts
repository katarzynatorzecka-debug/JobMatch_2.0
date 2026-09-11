import { describe, expect, it } from 'vitest'
import type { ImportedReport } from '../../contracts/import'
import { IMPORT_SESSION_STORAGE_KEY, loadImportedReport, saveImportedReport } from './importSessionStorage'

function memoryStorage(initial: Record<string, string> = {}) { const values = new Map(Object.entries(initial)); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }
const report: ImportedReport = { version: 2, source: 'rocketjobs-eml', reportProvider: 'rocketjobs', acquisitionChannel: 'eml', fileName: 'report.eml', importedAt: '2026-07-28T10:00:00.000Z', offers: [{ id: 'offer-abc123', title: 'Data Analyst', company: 'Example', missingFields: [], warnings: [] }], warnings: [] }

describe('importSessionStorage', () => {
  it('stores and reads only a valid normalized report', () => { const storage = memoryStorage(); expect(saveImportedReport(report, storage)).toBe(true); expect(loadImportedReport(storage).report).toEqual(report) })
  it('removes malformed and schema-invalid data', () => {
    const malformed = memoryStorage({ [IMPORT_SESSION_STORAGE_KEY]: '{broken' }); expect(loadImportedReport(malformed).report).toBeNull(); expect(malformed.getItem(IMPORT_SESSION_STORAGE_KEY)).toBeNull()
    const invalid = memoryStorage({ [IMPORT_SESSION_STORAGE_KEY]: JSON.stringify({ version: 1 }) }); expect(loadImportedReport(invalid).report).toBeNull(); expect(invalid.getItem(IMPORT_SESSION_STORAGE_KEY)).toBeNull()
  })
})

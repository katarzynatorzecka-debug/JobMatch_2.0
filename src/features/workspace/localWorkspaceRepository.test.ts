import { describe, expect, it } from 'vitest'
import type { ImportedReport } from '../../contracts/import'
import { localWorkspaceRepository } from './localWorkspaceRepository'
import { toWorkspaceImportInput } from './workspaceRepository'

class MemoryStorage { private values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null }; setItem(key: string, value: string) { this.values.set(key, value) } }
const now = '2026-08-04T10:00:00.000Z'
const report = (fileName: string, offers: ImportedReport['offers']): ImportedReport => ({ version: 1, source: 'rocketjobs-eml', fileName, importedAt: now, offers, warnings: [] })
const offer = (id: string, title: string, url: string, company = 'Acme') => ({ id, title, company, location: 'Warszawa', sourceUrl: url, missingFields: [], warnings: [] })

describe('local workspace repository', () => {
  it('keeps two imports in one workspace and reuses an exact URL without a new version', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const first = report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a?utm_source=x'), offer('a-2', 'Product Analyst', 'https://jobs.example.com/b')])
    const second = report('b.eml', [offer('b-1', 'Data Analyst', 'https://jobs.example.com/a'), offer('b-2', 'Operations Analyst', 'https://jobs.example.com/c')])
    await repository.importReport(toWorkspaceImportInput('demo-user', first))
    const result = await repository.importReport(toWorkspaceImportInput('demo-user', second))
    const snapshot = await repository.loadWorkspace()
    expect(result).toMatchObject({ newCount: 1, duplicateCount: 1 })
    expect(snapshot.importSessions).toHaveLength(2)
    expect(snapshot.activeOffers).toHaveLength(3)
    expect(snapshot.offerVersions).toHaveLength(3)
  })

  it('is idempotent for the same report and creates a version only when content changes', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const original = report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])
    const first = await repository.importReport(toWorkspaceImportInput('demo-user', original))
    const retried = await repository.importReport(toWorkspaceImportInput('demo-user', original))
    const changed = report('changed.eml', [{ ...offer('a-1', 'Senior Data Analyst', 'https://jobs.example.com/a') }])
    await repository.importReport(toWorkspaceImportInput('demo-user', changed))
    const details = await repository.loadOfferDetails(first.createdOfferIds[0])
    expect(retried).toMatchObject({ importSessionId: first.importSessionId, idempotent: true })
    expect(details.versionHistory).toHaveLength(2)
  })

  it('keeps a partial import coherent and restores reverted links without creating data', async () => {
    const storage = new MemoryStorage(); const repository = localWorkspaceRepository('demo-user', storage)
    const input = toWorkspaceImportInput('demo-user', report('partial.eml', [offer('valid', 'Data Analyst', 'https://jobs.example.com/a')]))
    input.invalidItems.push({ rawExternalId: 'invalid', reason: 'Brak firmy.' })
    const imported = await repository.importReport(input)
    expect(imported.status).toBe('partial')
    expect((await repository.loadWorkspace()).activeOffers).toHaveLength(1)
    await repository.revertImport(imported.importSessionId)
    expect((await repository.loadWorkspace()).activeOffers).toHaveLength(0)
    expect(await repository.reactivateImport(imported.importSessionId)).toMatchObject({ status: 'partial' })
    expect((await repository.loadWorkspace()).activeOffers).toHaveLength(1)
    expect((await localWorkspaceRepository('demo-user', storage).loadWorkspace()).importSessions).toHaveLength(1)
  })

  it('keeps historical details after revert and preserves a shared offer from another active import', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const first = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const second = await repository.importReport(toWorkspaceImportInput('demo-user', report('b.eml', [offer('b-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = first.createdOfferIds[0]
    await repository.revertImport(second.importSessionId)
    const details = await repository.loadOfferDetails(offerId)
    expect(details).toMatchObject({ isActive: true, offer: { id: offerId } })
    expect(details.importOccurrences).toHaveLength(2)
    await repository.revertImport(first.importSessionId)
    const historical = await repository.loadOfferDetails(offerId)
    expect(historical).toMatchObject({ isActive: false, offer: { id: offerId } })
    expect(historical.versionHistory).toHaveLength(1)
  })

  it('makes repeated transitions and a retry of a reverted import idempotent', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const input = toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')]))
    const imported = await repository.importReport(input)
    await repository.revertImport(imported.importSessionId)
    await repository.revertImport(imported.importSessionId)
    const retried = await repository.importReport(input)
    expect(retried).toMatchObject({ importSessionId: imported.importSessionId, status: 'active', idempotent: true })
    await repository.reactivateImport(imported.importSessionId)
    const snapshot = await repository.loadWorkspace()
    expect(snapshot.offerVersions).toHaveLength(1)
    expect(snapshot.importOfferLinks).toHaveLength(1)
  })

  it('returns the same controlled not-found code for both local transitions', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    await expect(repository.revertImport('missing')).rejects.toThrow('WORKSPACE_IMPORT_NOT_FOUND')
    await expect(repository.reactivateImport('missing')).rejects.toThrow('WORKSPACE_IMPORT_NOT_FOUND')
  })

  it('isolates independent demo stores and never needs Supabase for demo data', async () => {
    const left = localWorkspaceRepository('demo-user', new MemoryStorage()); const right = localWorkspaceRepository('demo-user', new MemoryStorage())
    await left.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    expect((await right.loadWorkspace()).activeOffers).toHaveLength(0)
  })
})

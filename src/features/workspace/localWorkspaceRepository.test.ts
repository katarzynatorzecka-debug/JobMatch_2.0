import { describe, expect, it } from 'vitest'
import type { ImportedReport } from '../../contracts/import'
import type { UserProfile } from '../../contracts/profile'
import { localWorkspaceRepository } from './localWorkspaceRepository'
import { toWorkspaceImportInput } from './workspaceRepository'

class MemoryStorage { private values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null }; setItem(key: string, value: string) { this.values.set(key, value) } }
const now = '2026-08-04T10:00:00.000Z'
const report = (fileName: string, offers: ImportedReport['offers']): ImportedReport => ({ version: 1, source: 'rocketjobs-eml', fileName, importedAt: now, offers, warnings: [] })
const offer = (id: string, title: string, url: string, company = 'Acme') => ({ id, title, company, location: 'Warszawa', sourceUrl: url, missingFields: [], warnings: [] })
const profile: UserProfile = { primaryRole: 'Analyst', alternativeRoles: [], experienceSummary: 'Test', skills: [], acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['preferences'] }

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

  it('keeps one session, link and version when the same idempotency key is replayed five times', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const input = toWorkspaceImportInput('demo-user', report('replay.eml', [offer('replay-1', 'Data Analyst', 'https://jobs.example.com/replay')]))

    for (let count = 0; count < 5; count += 1) await repository.importReport(input)

    const snapshot = await repository.loadWorkspace()
    expect(snapshot.importSessions).toHaveLength(1)
    expect(snapshot.offers).toHaveLength(1)
    expect(snapshot.importOfferLinks).toHaveLength(1)
    expect(snapshot.offerVersions).toHaveLength(1)
  })

  it('keeps five import occurrences on one canonical offer for five distinct reports with the same exact URL', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())

    for (let count = 1; count <= 5; count += 1) {
      await repository.importReport(toWorkspaceImportInput('demo-user', report(`occurrence-${count}.eml`, [offer(`occurrence-${count}`, 'Data Analyst', 'https://jobs.example.com/shared')])) )
    }

    const snapshot = await repository.loadWorkspace()
    expect(snapshot.importSessions).toHaveLength(5)
    expect(snapshot.offers).toHaveLength(1)
    expect(snapshot.importOfferLinks).toHaveLength(5)
    expect(snapshot.offerVersions).toHaveLength(1)
    expect(await repository.loadOfferList()).toHaveLength(1)
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

  it('persists lifecycle, flags and current hard filter across a new local repository instance', async () => {
    const storage = new MemoryStorage(); const repository = localWorkspaceRepository('demo-user', storage)
    const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'needs_review', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    await repository.setFavorite(offerId, true); await repository.setApplied(offerId, true); await repository.excludeOffer(offerId); await repository.excludeOffer(offerId); await repository.restoreOffer(offerId); await repository.markViewed(offerId)
    const restored = await localWorkspaceRepository('demo-user', storage).loadOfferDetails(offerId)
    expect(restored.listItem?.userState).toMatchObject({ favorite: true, applied: true, lifecycleStatus: 'needs_review' })
    expect(restored.listItem?.hardFilter?.status).toBe('needs_review')
    expect(restored.listItem?.userState?.lastViewedAt).toBeTruthy()
  })

  it('blocks restoring an offer with a current hard-filter fail', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage()); const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'fail', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    await expect(repository.restoreOffer(offerId)).rejects.toThrow('WORKSPACE_RESTORE_BLOCKED_BY_HARD_FILTER')
  })

  it('recovers a hard-filter exclusion when a later pass or needs-review result replaces it', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'fail', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    expect((await repository.loadOfferDetails(offerId)).userState).toMatchObject({ lifecycleStatus: 'new', exclusionReason: null, excludedAt: null })
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'fail', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'needs_review', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    expect((await repository.loadOfferDetails(offerId)).userState).toMatchObject({ lifecycleStatus: 'needs_review', exclusionReason: null, excludedAt: null })
  })

  it('keeps a manual exclusion when a later Hard Filter passes', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    await repository.excludeOffer(offerId)
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    expect((await repository.loadOfferDetails(offerId)).userState).toMatchObject({ lifecycleStatus: 'excluded', exclusionReason: 'user_decision' })
  })

  it('reuses local profile versions by hash and links hard-filter results to the version ID', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    const first = await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    const repeat = await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    const changed = await repository.persistHardFilterBatch({ profile: { ...profile, primaryRole: 'Senior Analyst' }, profileHash: 'profile-v2', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    const snapshot = await repository.loadWorkspace()
    expect(first.profileVersionId).toBe(repeat.profileVersionId)
    expect(changed.profileVersionId).not.toBe(first.profileVersionId)
    expect(snapshot.profileVersions.map((item) => item.versionNumber)).toEqual([1, 2])
    expect(snapshot.hardFilterResults.find((item) => item.isCurrent)?.profileVersionId).toBe(changed.profileVersionId)
  })

  it('rejects duplicate offer IDs before changing local hard-filter data', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    const item = { jobOfferId: offerId, offerVersionId: versionId, status: 'pass' as const, reasons: [], missingInformation: [], checkedCriteria: [] }
    await expect(repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [item, item] })).rejects.toThrow('WORKSPACE_DUPLICATE_HARD_FILTER_ITEM')
    expect((await repository.loadWorkspace()).hardFilterResults).toHaveLength(0)
  })

  it('hides B-only reverted offers from the default list but keeps their historical details', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])))
    const second = await repository.importReport(toWorkspaceImportInput('demo-user', report('b.eml', [offer('b-1', 'Product Analyst', 'https://jobs.example.com/b')])))
    const historicalOfferId = second.createdOfferIds[0]
    await repository.revertImport(second.importSessionId)
    expect((await repository.loadOfferList()).map((item) => item.offer.id)).not.toContain(historicalOfferId)
    expect(await repository.loadOfferDetails(historicalOfferId)).toMatchObject({ isActive: false, offer: { id: historicalOfferId } })
  })

  it('creates one explicit active queue item, blocks HF fail and permits a queued cancel', async () => {
    const repository = localWorkspaceRepository('demo-user', new MemoryStorage())
    const imported = await repository.importReport(toWorkspaceImportInput('demo-user', report('a.eml', [offer('a-1', 'Data Analyst', 'https://jobs.example.com/a')])));
    const offerId = imported.createdOfferIds[0]; const versionId = (await repository.loadOfferDetails(offerId)).currentVersion!.id
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    const first = await repository.enqueueAnalysis(offerId); const repeated = await repository.enqueueAnalysis(offerId)
    expect(repeated).toMatchObject({ idempotent: true, queueItem: { id: first.queueItem.id, status: 'queued' } })
    await repository.cancelQueuedAnalysis(first.queueItem.id)
    expect((await repository.loadOfferDetails(offerId)).analysisState.queueItem).toBeNull()
    await repository.persistHardFilterBatch({ profile, profileHash: 'profile-v1', algorithmVersion: 'hf-v1', items: [{ jobOfferId: offerId, offerVersionId: versionId, status: 'fail', reasons: [], missingInformation: [], checkedCriteria: [] }] })
    await expect(repository.enqueueAnalysis(offerId)).rejects.toThrow('WORKSPACE_ANALYSIS_BLOCKED_BY_HARD_FILTER')
  })
})

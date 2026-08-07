import { describe, expect, it, vi } from 'vitest'
import type { ImportedJobOffer } from '../../contracts/import'
import { defaultProfile } from '../profile/profileDefaults'
import { retryIntegratedOffer, runIntegratedAnalysisBatch, waitForIntegratedAnalysisCompletion } from './integratedAnalysisFlow'

function offer(id: string, title = 'Automation Specialist'): ImportedJobOffer { return { id, title, company: 'Example', sourceUrl: `https://example.test/${id}`, missingFields: [], warnings: [] } }
function report(key: string, offers: ReturnType<typeof offer>[]) { return { key, report: { version: 1 as const, source: 'rocketjobs-eml' as const, fileName: `${key}.eml`, importedAt: '2026-08-06T10:00:00.000Z', offers, warnings: [] }, offers } }

function repositoryFor(items: ReturnType<typeof report>[]) {
  const links = items.flatMap((entry, index) => entry.offers.map((entryOffer) => ({ importSessionId: `session-${index}`, rawExternalId: entryOffer.id, jobOfferId: `offer-${entryOffer.id}`, offerVersionId: `version-${entryOffer.id}` })))
  const queue = vi.fn(async (offerId: string) => ({ queueItem: { id: `queue-${offerId}` }, idempotent: false }))
  return {
    importReport: vi.fn(async () => ({ importSessionId: `session-${repositoryForCalls++}` })), setActiveImportSession: vi.fn(async () => undefined),
    loadWorkspace: vi.fn(async () => ({ importOfferLinks: links })),
    persistHardFilterBatch: vi.fn(async () => ({ profileVersionId: 'profile-v1', hardFilterResultIds: [] })),
    enqueueAnalysis: queue,
    completeLocalAnalysis: vi.fn(async () => undefined),
    loadOfferList: vi.fn(async () => []),
    queue,
  }
}
let repositoryForCalls = 0

describe('integrated analysis batch', () => {
  it('starts the visible batch once, automatically queues PASS/NEEDS_REVIEW and skips FAIL', async () => {
    repositoryForCalls = 0
    const reports = [report('A', [offer('pass'), { ...offer('needs-review'), missingFields: ['rodzaj umowy'], warnings: ['Brak danych: rodzaj umowy.'] }, offer('fail', 'Niechciane stanowisko')])]
    const repository = repositoryFor(reports); const states: string[] = []
    await runIntegratedAnalysisBatch({ repository: repository as never, mode: 'demo', userId: 'demo-user', profile: { ...defaultProfile, excludedKeywords: ['niechciane'] }, reports, onCounts: () => undefined, onOfferProgress: (entry) => states.push(`${entry.offer.id}:${entry.state}`) })
    expect(repository.importReport).toHaveBeenCalledTimes(1)
    expect(repository.persistHardFilterBatch).toHaveBeenCalledTimes(1)
    expect(repository.queue).toHaveBeenCalledTimes(2)
    expect(repository.queue).not.toHaveBeenCalledWith('offer-fail')
    expect(states).toContain('pass:processing')
    expect(states).toContain('pass:completed')
    expect(states).toContain('needs-review:processing')
    expect(states).toContain('needs-review:completed')
    expect(states).toContain('fail:rejected')
    expect(states).not.toContain('pass:rejected')
    expect(states).not.toContain('needs-review:rejected')
  })

  it('continues the batch after one offer fails', async () => {
    repositoryForCalls = 0
    const reports = [report('A', [offer('one'), offer('two')])]
    const repository = repositoryFor(reports); repository.completeLocalAnalysis.mockRejectedValueOnce(new Error('fixture failure'))
    const states: string[] = []
    const result = await runIntegratedAnalysisBatch({ repository: repository as never, mode: 'demo', userId: 'demo-user', profile: defaultProfile, reports, onCounts: () => undefined, onOfferProgress: (entry) => states.push(`${entry.offer.id}:${entry.state}`) })
    expect(states).toContain('one:failed')
    expect(states).toContain('two:completed')
    expect(result.partial).toBe(true)
  })

  it('projects one canonical analysis status back to every occurrence from separate reports', async () => {
    repositoryForCalls = 0
    const reports = [report('A', [offer('shared')]), report('B', [offer('shared')])]
    const repository = repositoryFor(reports); const states: string[] = []; const counts: number[] = []
    await runIntegratedAnalysisBatch({ repository: repository as never, mode: 'demo', userId: 'demo-user', profile: defaultProfile, reports, onCounts: (entry) => counts.push(entry.completed), onOfferProgress: (entry) => states.push(`${entry.key}:${entry.state}`) })
    expect(repository.queue).toHaveBeenCalledTimes(1)
    expect(states).toContain('A:shared:completed')
    expect(states).toContain('B:shared:completed')
    expect(counts).toContain(2)
  })

  it('waits for the durable queue projection instead of optimistically completing an authenticated tile', async () => {
    const analysis = { offerId: 'offer-1', overallScore: 82 }
    const loadOfferDetails = vi.fn()
      .mockResolvedValueOnce({ listItem: null, analysisState: { queueItem: { status: 'processing' }, errorCode: null } })
      .mockResolvedValueOnce({ listItem: { analysis }, analysisState: { queueItem: null, errorCode: null } })
    await expect(waitForIntegratedAnalysisCompletion({ loadOfferDetails } as never, 'offer-1', { maxAttempts: 2, wait: async () => undefined })).resolves.toEqual(analysis)
    expect(loadOfferDetails).toHaveBeenCalledTimes(2)
  })

  it('returns a controlled timeout when a durable queue never completes, without requesting another analysis', async () => {
    const loadOfferDetails = vi.fn(async () => ({ listItem: null, analysisState: { queueItem: { status: 'queued' }, errorCode: null } }))
    await expect(waitForIntegratedAnalysisCompletion({ loadOfferDetails } as never, 'offer-1', { maxAttempts: 2, wait: async () => undefined })).rejects.toThrow('ANALYSIS_QUEUE_TIMEOUT')
    expect(loadOfferDetails).toHaveBeenCalledTimes(2)
  })

  it('uses one explicit override enqueue for a rejected offer and does not duplicate its local completion', async () => {
    const enqueueAnalysis = vi.fn(async () => ({ queueItem: { id: 'queue-fail' }, idempotent: false }))
    const completeLocalAnalysis = vi.fn(async () => undefined)
    const progress: string[] = []
    await retryIntegratedOffer({ repository: { enqueueAnalysis, completeLocalAnalysis } as never, mode: 'demo', profile: defaultProfile, offerId: 'offer-fail', offer: offer('fail', 'Rejected role'), hardFilterStatus: 'fail', allowHardFilterFail: true, onProgress: (entry) => progress.push(entry.state) })
    expect(enqueueAnalysis).toHaveBeenCalledWith('offer-fail', { allowHardFilterFail: true })
    expect(completeLocalAnalysis).toHaveBeenCalledTimes(1)
    expect(progress).toEqual(['queued', 'processing', 'completed'])
  })
})

import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from './workspaceRepository'
import { projectWorkspaceOffer, projectWorkspaceOfferDetails, projectWorkspaceOfferList } from './workspaceReadModel'

const offer = { id: 'offer-1', currentVersionId: null } as never

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    profile: null,
    importSessions: [{ id: 'import-1', status: 'active' } as never],
    offers: [offer],
    activeOffers: [offer],
    profileVersions: [],
    offerVersions: [],
    importOfferLinks: [{ jobOfferId: 'offer-1', importSessionId: 'import-1', matchType: 'new', needsReview: false } as never],
    offerUserStates: [{ jobOfferId: 'offer-1', lifecycleStatus: 'new' } as never],
    hardFilterResults: [],
    analyses: [],
    legacyAnalysisIssues: [],
    analysisQueue: [],
    workspaceAnalyses: [],
    analysisVersions: [],
    recentlyViewed: [],
    ...overrides,
  }
}

describe('workspace read model', () => {
  it('projects an unambiguous existing analysis as analyzed without changing favorite or applied state', () => {
    const item = projectWorkspaceOffer(snapshot({
      analyses: [{ offerId: 'offer-1' } as never],
      offerUserStates: [{ jobOfferId: 'offer-1', lifecycleStatus: 'new', favorite: true, applied: true } as never],
    }), offer)
    expect(item.userState).toMatchObject({ lifecycleStatus: 'analyzed', favorite: true, applied: true })
  })

  it('keeps a hard-filter fail above an existing analysis', () => {
    const item = projectWorkspaceOffer(snapshot({
      analyses: [{ offerId: 'offer-1' } as never],
      hardFilterResults: [{ jobOfferId: 'offer-1', isCurrent: true, status: 'fail' } as never],
    }), offer)
    expect(item.userState?.lifecycleStatus).toBe('excluded')
  })

  it('renders one projection when a source returns the same canonical offer ID twice', () => {
    const duplicate = offer
    const items = projectWorkspaceOfferList(snapshot({ offers: [offer, duplicate], activeOffers: [offer, duplicate] }))

    expect(items).toHaveLength(1)
    expect(items[0].offer.id).toBe('offer-1')
  })

  it('orders the default canonical list by most recently seen offer first', () => {
    const older = { id: 'offer-old', currentVersionId: null, createdAt: '2026-08-01T10:00:00.000Z', lastSeenAt: '2026-08-01T10:00:00.000Z' } as never
    const newer = { id: 'offer-new', currentVersionId: null, createdAt: '2026-08-02T10:00:00.000Z', lastSeenAt: '2026-08-06T10:00:00.000Z' } as never
    const items = projectWorkspaceOfferList(snapshot({
      offers: [older, newer],
      activeOffers: [older, newer],
      importSessions: [
        { id: 'import-old', status: 'active', createdAt: '2026-08-01T10:00:00.000Z' } as never,
        { id: 'import-new', status: 'active', createdAt: '2026-08-06T10:00:00.000Z' } as never,
      ],
      importOfferLinks: [
        { jobOfferId: 'offer-old', importSessionId: 'import-old', matchType: 'new', needsReview: false } as never,
        { jobOfferId: 'offer-new', importSessionId: 'import-new', matchType: 'new', needsReview: false } as never,
      ],
      offerUserStates: [
        { jobOfferId: 'offer-old', lifecycleStatus: 'new' } as never,
        { jobOfferId: 'offer-new', lifecycleStatus: 'new' } as never,
      ],
    }))

    expect(items.map((item) => item.offer.id)).toEqual(['offer-new', 'offer-old'])
  })

  it('rejects a latest analysis pointer that belongs to a different canonical offer', () => {
    const item = projectWorkspaceOffer(snapshot({
      workspaceAnalyses: [{ jobOfferId: 'offer-1', latestVersionId: 'analysis-version-2' } as never],
      analysisVersions: [{ id: 'analysis-version-2', jobOfferId: 'offer-2', analysisData: {}, createdAt: '2026-08-05T10:00:00.000Z' } as never],
    }), offer)

    expect(item.analysis).toBeNull()
    expect(item.analysisState.errorCode).toBe('WORKSPACE_ANALYSIS_IDENTITY_MISMATCH')
  })

  it('does not silently fall back to legacy data when the latest versioned analysis is malformed', () => {
    const item = projectWorkspaceOffer(snapshot({
      analyses: [{ offerId: 'offer-1' } as never],
      workspaceAnalyses: [{ jobOfferId: 'offer-1', latestVersionId: 'analysis-version-1' } as never],
      analysisVersions: [{ id: 'analysis-version-1', jobOfferId: 'offer-1', analysisData: {}, createdAt: '2026-08-05T10:00:00.000Z' } as never],
    }), offer)

    expect(item.analysis).toBeNull()
    expect(item.analysisState.errorCode).toBe('WORKSPACE_ANALYSIS_INVALID_RESPONSE')
    expect(item.analysisState.isLegacyFallback).toBe(false)
  })

  it('does not present a v7 analysis before both localized narratives are persisted', () => {
    const analysisData = { offerId: 'offer-1', overallScore: 72, categoryScores: { experience: { score: 72, rationale: 'ok' }, skills: { score: 72, rationale: 'ok' }, preferences: { score: 72, rationale: 'ok' }, growth: { score: 72, rationale: 'ok' } }, recommendation: 'Wymaga sprawdzenia', summary: 'Polskie podsumowanie.', strengths: [], risks: [], missingInformation: [], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'gpt-5.4-mini', provisional: true }, createdAt: '2026-09-05T12:00:00.000Z', status: 'ready' }
    const item = projectWorkspaceOffer(snapshot({
      workspaceAnalyses: [{ jobOfferId: 'offer-1', latestVersionId: 'analysis-version-v7' } as never],
      analysisVersions: [{ id: 'analysis-version-v7', jobOfferId: 'offer-1', promptVersion: 'jobmatch-job-match-v7-bilingual', analysisData } as never],
    }), offer)

    expect(item.analysis).toBeNull()
    expect(item.analysisState.errorCode).toBe('WORKSPACE_ANALYSIS_LOCALIZATION_MISSING')
  })

  it('surfaces a failed queue item as a real retryable error without treating it as in progress', () => {
    const item = projectWorkspaceOffer(snapshot({
      analysisQueue: [{ jobOfferId: 'offer-1', status: 'failed', lastError: 'PROVIDER_TIMEOUT' } as never],
    }), offer)

    expect(item.analysisState.queueItem).toBeNull()
    expect(item.analysisState.errorCode).toBe('PROVIDER_TIMEOUT')
  })

  it('does not present a previous version as current after a newer reanalysis fails', () => {
    const previousCreatedAt = '2026-09-02T12:51:33.581Z'
    const previous = { offerId: 'offer-1', overallScore: 95, categoryScores: { experience: { score: 80, rationale: 'ok' }, skills: { score: 100, rationale: 'ok' }, preferences: { score: 100, rationale: 'ok' }, growth: { score: 0, rationale: 'Brak danych' } }, recommendation: 'Wymaga sprawdzenia', summary: 'stary wynik', strengths: [], risks: [], missingInformation: [], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'test', provisional: true }, createdAt: previousCreatedAt, status: 'ready', scoring: { algorithmVersion: 'jobmatch-deterministic-r8', weights: { employerFit: 80, userCompatibility: 20 }, coverage: 63, criterionConfidence: 77, reliability: 'limited', scoredCategories: ['experience', 'skills', 'preferences'] } } as never
    const item = projectWorkspaceOffer(snapshot({
      profile: { currentVersionId: 'profile-1' } as never,
      workspaceAnalyses: [{ jobOfferId: 'offer-1', latestVersionId: 'analysis-version-1' } as never],
      analysisVersions: [{ id: 'analysis-version-1', jobOfferId: 'offer-1', offerVersionId: 'offer-version-1', profileVersionId: 'profile-1', analysisData: previous, createdAt: previousCreatedAt, algorithmVersion: 'jobmatch-deterministic-r8' } as never],
      analysisQueue: [{ jobOfferId: 'offer-1', status: 'queued', lastError: 'OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH', queuedAt: '2026-09-04T13:59:25.999Z' } as never],
    }), offer)

    expect(item.analysis).toBeNull()
    expect(item.analysisState.errorCode).toBe('OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH')
    expect(item.userState?.lifecycleStatus).toBe('selected_for_analysis')
  })

  it('does not carry an old queue error over a newer successful analysis', () => {
    const currentCreatedAt = '2026-09-04T14:52:17.139Z'
    const current = { offerId: 'offer-1', overallScore: 28, categoryScores: { experience: { score: 0, rationale: 'ok' }, skills: { score: 10, rationale: 'ok' }, preferences: { score: 60, rationale: 'ok' }, growth: { score: null, rationale: 'Brak danych' } }, recommendation: 'Nie rekomenduję', summary: 'nowy wynik', strengths: [], risks: [], missingInformation: [], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'gpt-5.4-mini', provisional: true }, createdAt: currentCreatedAt, status: 'ready', scoring: { algorithmVersion: 'jobmatch-deterministic-r10-critical-priority', weights: { employerFit: 80, userCompatibility: 20 }, coverage: 100, criterionConfidence: 92, reliability: 'standard', scoredCategories: ['experience', 'skills', 'preferences'] } } as never
    const item = projectWorkspaceOffer(snapshot({
      workspaceAnalyses: [{ jobOfferId: 'offer-1', latestVersionId: 'analysis-version-2' } as never],
      analysisVersions: [{ id: 'analysis-version-2', jobOfferId: 'offer-1', analysisData: current, createdAt: currentCreatedAt, algorithmVersion: 'jobmatch-deterministic-r10-critical-priority' } as never],
      analysisQueue: [{ jobOfferId: 'offer-1', status: 'failed', lastError: 'OLD_PROVIDER_ERROR', queuedAt: '2026-09-02T12:51:15.896Z' } as never],
    }), offer)

    expect(item.analysis?.overallScore).toBe(28)
    expect(item.analysisState.errorCode).toBeNull()
  })
})

describe('historical canonical projection', () => {
  it('does not duplicate a canonical offer in the historical list', () => {
    const historical = { id: 'offer-history', currentVersionId: null, createdAt: '2026-08-01T10:00:00.000Z', lastSeenAt: '2026-08-01T10:00:00.000Z' } as never
    const items = projectWorkspaceOfferList(snapshot({
      importSessions: [{ id: 'import-1', status: 'reverted' } as never],
      offers: [historical, historical],
      activeOffers: [],
      importOfferLinks: [{ jobOfferId: 'offer-history', importSessionId: 'import-1', matchType: 'new', needsReview: false } as never],
      offerUserStates: [{ jobOfferId: 'offer-history', lifecycleStatus: 'new' } as never],
    }), true)

    expect(items).toHaveLength(1)
    expect(items[0].offer.id).toBe('offer-history')
    expect(items[0].isActive).toBe(false)
  })

  it('preserves r8 and r9 analysis versions as ordered history after the latest pointer advances', () => {
    const details = projectWorkspaceOfferDetails(snapshot({
      analysisVersions: [
        { id: 'analysis-r8', jobOfferId: 'offer-1', algorithmVersion: 'jobmatch-deterministic-r8', createdAt: '2026-09-02T10:00:00.000Z' } as never,
        { id: 'analysis-r9', jobOfferId: 'offer-1', algorithmVersion: 'jobmatch-deterministic-r9', createdAt: '2026-09-02T11:00:00.000Z' } as never,
      ],
    }), 'offer-1')

    expect(details.analysisHistory.map(({ id, algorithmVersion }) => ({ id, algorithmVersion }))).toEqual([
      { id: 'analysis-r9', algorithmVersion: 'jobmatch-deterministic-r9' },
      { id: 'analysis-r8', algorithmVersion: 'jobmatch-deterministic-r8' },
    ])
  })
})

describe('canonical report date projection', () => {
  it('uses the newest active import session occurrence and ignores reverted sessions', () => {
    const item = projectWorkspaceOffer(snapshot({
      importSessions: [
        { id: 'import-old', status: 'active', createdAt: '2026-08-01T10:00:00.000Z' } as never,
        { id: 'import-new', status: 'active', createdAt: '2026-08-06T10:00:00.000Z' } as never,
        { id: 'import-reverted', status: 'reverted', createdAt: '2026-08-08T10:00:00.000Z' } as never,
      ],
      importOfferLinks: [
        { jobOfferId: 'offer-1', importSessionId: 'import-old', matchType: 'new', needsReview: false } as never,
        { jobOfferId: 'offer-1', importSessionId: 'import-new', matchType: 'duplicate', needsReview: false } as never,
        { jobOfferId: 'offer-1', importSessionId: 'import-reverted', matchType: 'duplicate', needsReview: false } as never,
      ],
    }), offer)

    expect(item.latestImportSessionAt).toBe('2026-08-06T10:00:00.000Z')
  })
})

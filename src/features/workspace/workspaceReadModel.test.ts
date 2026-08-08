import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from './workspaceRepository'
import { projectWorkspaceOffer, projectWorkspaceOfferList } from './workspaceReadModel'

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

  it('surfaces a failed queue item as a real retryable error without treating it as in progress', () => {
    const item = projectWorkspaceOffer(snapshot({
      analysisQueue: [{ jobOfferId: 'offer-1', status: 'failed', lastError: 'PROVIDER_TIMEOUT' } as never],
    }), offer)

    expect(item.analysisState.queueItem).toBeNull()
    expect(item.analysisState.errorCode).toBe('PROVIDER_TIMEOUT')
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

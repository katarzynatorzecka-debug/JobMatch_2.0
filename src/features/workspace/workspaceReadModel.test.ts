import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from './workspaceRepository'
import { projectWorkspaceOffer } from './workspaceReadModel'

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
})

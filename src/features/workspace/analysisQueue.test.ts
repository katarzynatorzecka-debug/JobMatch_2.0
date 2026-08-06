import { describe, expect, it } from 'vitest'
import { analysisFreshness, CURRENT_ANALYSIS_ALGORITHM_VERSION, queueLifecycle } from './analysisQueue'

const version = { profileVersionId: 'profile-v1', offerVersionId: 'offer-v1', algorithmVersion: CURRENT_ANALYSIS_ALGORITHM_VERSION, promptVersion: 'jobmatch-job-match-v1', modelVersion: 'gpt-5.4-mini', hardFilterStatus: 'pass' } as never

describe('workspace analysis queue projection', () => {
  it('uses a deterministic freshness priority', () => {
    expect(analysisFreshness({ latestVersion: null, profile: null, offerVersionId: null, hardFilter: null })).toBe('missing')
    expect(analysisFreshness({ latestVersion: version, profile: { currentVersionId: 'other' } as never, offerVersionId: 'offer-v1', hardFilter: null })).toBe('stale_profile')
    expect(analysisFreshness({ latestVersion: version, profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'other', hardFilter: null })).toBe('stale_offer')
    expect(analysisFreshness({ latestVersion: version, profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'offer-v1', hardFilter: { status: 'pass' } as never })).toBe('current')
    expect(analysisFreshness({ latestVersion: { profileVersionId: 'profile-v1', offerVersionId: 'offer-v1', algorithmVersion: CURRENT_ANALYSIS_ALGORITHM_VERSION, promptVersion: 'jobmatch-job-match-v1', modelVersion: 'gpt-5.4-mini', hardFilterStatus: 'weak' } as never, profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'offer-v1', hardFilter: { status: 'needs_review' } as never })).toBe('current')
  })

  it('projects active queue work before analysis, but never above exclusion', () => {
    expect(queueLifecycle({ current: { lifecycleStatus: 'new' } as never, hardFilter: { status: 'pass' } as never, queueItem: { status: 'queued' } as never, hasCurrentAnalysis: false, possibleDuplicate: false })).toBe('selected_for_analysis')
    expect(queueLifecycle({ current: { lifecycleStatus: 'excluded' } as never, hardFilter: { status: 'pass' } as never, queueItem: { status: 'processing' } as never, hasCurrentAnalysis: true, possibleDuplicate: false })).toBe('excluded')
  })
})

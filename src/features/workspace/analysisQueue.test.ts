import { describe, expect, it } from 'vitest'
import type { AnalysisVersion } from '../../contracts/workspace'
import { analysisFreshness, CURRENT_ANALYSIS_ALGORITHM_VERSION, CURRENT_ANALYSIS_PROMPT_VERSION, queueLifecycle } from './analysisQueue'

const version = { profileVersionId: 'profile-v1', offerVersionId: 'offer-v1', algorithmVersion: CURRENT_ANALYSIS_ALGORITHM_VERSION, promptVersion: CURRENT_ANALYSIS_PROMPT_VERSION, modelVersion: 'gpt-5.4-mini', hardFilterStatus: 'pass' } as AnalysisVersion

describe('workspace analysis queue projection', () => {
  it('uses a deterministic freshness priority', () => {
    expect(analysisFreshness({ latestVersion: null, profile: null, offerVersionId: null, hardFilter: null })).toBe('missing')
    expect(analysisFreshness({ latestVersion: version, profile: { currentVersionId: 'other' } as never, offerVersionId: 'offer-v1', hardFilter: null })).toBe('stale_profile')
    expect(analysisFreshness({ latestVersion: version, profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'other', hardFilter: null })).toBe('stale_offer')
    expect(analysisFreshness({ latestVersion: version, profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'offer-v1', hardFilter: { status: 'pass' } as never })).toBe('current')
    expect(analysisFreshness({ latestVersion: { profileVersionId: 'profile-v1', offerVersionId: 'offer-v1', algorithmVersion: CURRENT_ANALYSIS_ALGORITHM_VERSION, promptVersion: CURRENT_ANALYSIS_PROMPT_VERSION, modelVersion: 'gpt-5.4-mini', hardFilterStatus: 'weak' } as never, profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'offer-v1', hardFilter: { status: 'needs_review' } as never })).toBe('current')
  })

  it('marks the old baseline stale while accepting the coherent bilingual identity', () => {
    const context = { profile: { currentVersionId: 'profile-v1' } as never, offerVersionId: 'offer-v1', hardFilter: { status: 'pass' } as never }
    expect(CURRENT_ANALYSIS_ALGORITHM_VERSION).toBe('jobmatch-deterministic-r10-critical-priority')
    expect(CURRENT_ANALYSIS_PROMPT_VERSION).toBe('jobmatch-job-match-v7-bilingual')
    expect(analysisFreshness({ ...context, latestVersion: { profileVersionId: 'profile-v1', offerVersionId: 'offer-v1', algorithmVersion: 'jobmatch-deterministic-r8', promptVersion: 'jobmatch-job-match-v4', modelVersion: 'gpt-5.4-mini', hardFilterStatus: 'pass' } as never })).toBe('stale_algorithm')
    expect(analysisFreshness({ ...context, latestVersion: version })).toBe('current')
    expect(analysisFreshness({ ...context, latestVersion: { ...version, promptVersion: 'jobmatch-job-match-v6' } })).toBe('current')
  })

  it('projects active queue work before analysis, but never above exclusion', () => {
    expect(queueLifecycle({ current: { lifecycleStatus: 'new' } as never, hardFilter: { status: 'pass' } as never, queueItem: { status: 'queued' } as never, hasCurrentAnalysis: false, possibleDuplicate: false })).toBe('selected_for_analysis')
    expect(queueLifecycle({ current: { lifecycleStatus: 'excluded' } as never, hardFilter: { status: 'pass' } as never, queueItem: { status: 'processing' } as never, hasCurrentAnalysis: true, possibleDuplicate: false })).toBe('excluded')
  })
})

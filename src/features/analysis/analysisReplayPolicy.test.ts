import { describe, expect, it } from 'vitest'
import { analysisReplayAction, analysisReplayLabel } from './analysisReplayPolicy'

describe('analysis replay policy', () => {
  it('does not turn a current persisted result into an implicit reanalysis', () => {
    const action = analysisReplayAction({ hasLatestVersion: true, freshness: 'current' })
    expect(action).toBe('current')
    expect(analysisReplayLabel(action)).toBe('Wynik jest aktualny')
  })

  it('allows a normal refresh only when the stored result is stale', () => {
    expect(analysisReplayAction({ hasLatestVersion: true, freshness: 'stale_profile' })).toBe('refresh_stale')
    expect(analysisReplayLabel('refresh_stale')).toBe('Odśwież analizę')
  })

  it('keeps active queue work non-actionable', () => {
    expect(analysisReplayAction({ hasLatestVersion: false, freshness: 'missing', queueStatus: 'processing' })).toBe('in_progress')
  })
})

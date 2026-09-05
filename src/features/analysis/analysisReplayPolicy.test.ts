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

  it('allows replaying a queued item that contains a failed attempt', () => {
    expect(analysisReplayAction({ hasLatestVersion: true, freshness: 'stale_algorithm', queueStatus: 'queued', queueHasError: true })).toBe('retry_failed')
    expect(analysisReplayLabel('retry_failed', true)).toBe('Ponów analizę')
  })

  it('localizes replay actions in English', () => {
    expect(analysisReplayLabel('current', false, 'en')).toBe('Result is up to date')
    expect(analysisReplayLabel('retry_failed', true, 'en')).toBe('Retry analysis')
    expect(analysisReplayLabel('refresh_stale', false, 'en')).toBe('Refresh analysis')
  })
})

import type { AnalysisFreshnessStatus, AnalysisQueueStatus } from '../../contracts/workspace'

export type AnalysisReplayAction = 'initial' | 'refresh_stale' | 'current' | 'in_progress'

/**
 * A current persisted result is the source of truth. It must never be turned
 * into an implicit paid reanalysis merely by pressing the primary action.
 */
export function analysisReplayAction(input: { hasLatestVersion: boolean; freshness: AnalysisFreshnessStatus; queueStatus?: AnalysisQueueStatus | null }): AnalysisReplayAction {
  if (input.queueStatus === 'queued' || input.queueStatus === 'processing') return 'in_progress'
  if (!input.hasLatestVersion) return 'initial'
  return input.freshness === 'current' ? 'current' : 'refresh_stale'
}

export function analysisReplayLabel(action: AnalysisReplayAction, hasError = false) {
  if (hasError) return 'Ponów analizę'
  if (action === 'current') return 'Wynik jest aktualny'
  if (action === 'refresh_stale') return 'Odśwież analizę'
  return 'Analizuj ofertę'
}

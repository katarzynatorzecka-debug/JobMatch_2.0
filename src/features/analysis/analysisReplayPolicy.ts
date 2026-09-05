import type { AnalysisFreshnessStatus, AnalysisQueueStatus } from '../../contracts/workspace'
import { translate } from '../../i18n/I18nProvider'
import type { Locale } from '../../i18n/locale'

export type AnalysisReplayAction = 'initial' | 'refresh_stale' | 'retry_failed' | 'current' | 'in_progress'

/**
 * A current persisted result is the source of truth. It must never be turned
 * into an implicit paid reanalysis merely by pressing the primary action.
 */
export function analysisReplayAction(input: { hasLatestVersion: boolean; freshness: AnalysisFreshnessStatus; queueStatus?: AnalysisQueueStatus | null; queueHasError?: boolean }): AnalysisReplayAction {
  if (input.queueStatus === 'processing' || (input.queueStatus === 'queued' && !input.queueHasError)) return 'in_progress'
  if (input.queueStatus === 'queued' && input.queueHasError) return 'retry_failed'
  if (!input.hasLatestVersion) return 'initial'
  return input.freshness === 'current' ? 'current' : 'refresh_stale'
}

export function analysisReplayLabel(action: AnalysisReplayAction, hasError = false, locale: Locale = 'pl') {
  if (hasError) return translate(locale, 'domain.analysis.replay.retry')
  if (action === 'current') return translate(locale, 'domain.analysis.replay.current')
  if (action === 'refresh_stale') return translate(locale, 'domain.analysis.replay.refresh')
  return translate(locale, 'domain.analysis.replay.initial')
}

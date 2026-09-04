import type { AnalysisFreshnessStatus, AnalysisQueueItem, AnalysisVersion, HardFilterResultRecord, OfferUserState, WorkspaceProfile } from '../../contracts/workspace'

export const CURRENT_ANALYSIS_ALGORITHM_VERSION = 'jobmatch-deterministic-r10-critical-priority'
export const CURRENT_ANALYSIS_PROMPT_VERSION = 'jobmatch-job-match-v6'
export const CURRENT_ANALYSIS_MODEL_VERSION = 'gpt-5.4-mini'

function analysisHardFilterStatus(status: HardFilterResultRecord['status']) { return status === 'needs_review' ? 'weak' : status }

export function analysisFreshness(input: {
  latestVersion: AnalysisVersion | null
  profile: WorkspaceProfile | null
  offerVersionId: string | null
  hardFilter: HardFilterResultRecord | null
}): AnalysisFreshnessStatus {
  const { latestVersion } = input
  if (!latestVersion) return 'missing'
  if (!input.profile?.currentVersionId || latestVersion.profileVersionId !== input.profile.currentVersionId) return 'stale_profile'
  if (!input.offerVersionId || latestVersion.offerVersionId !== input.offerVersionId) return 'stale_offer'
  if (latestVersion.algorithmVersion !== CURRENT_ANALYSIS_ALGORITHM_VERSION) return 'stale_algorithm'
  if (latestVersion.promptVersion !== CURRENT_ANALYSIS_PROMPT_VERSION) return 'stale_prompt'
  if (latestVersion.modelVersion !== CURRENT_ANALYSIS_MODEL_VERSION) return 'stale_model'
  if (input.hardFilter && latestVersion.hardFilterStatus !== analysisHardFilterStatus(input.hardFilter.status)) return 'stale_offer'
  return 'current'
}

export function queueLifecycle(input: {
  current: OfferUserState | null
  hardFilter: HardFilterResultRecord | null
  queueItem: AnalysisQueueItem | null
  hasCurrentAnalysis: boolean
  possibleDuplicate: boolean
}) {
  if (input.hardFilter?.status === 'fail' || input.current?.lifecycleStatus === 'excluded') return 'excluded' as const
  if (input.queueItem?.status === 'queued' || input.queueItem?.status === 'processing') return 'selected_for_analysis' as const
  if (input.hasCurrentAnalysis) return 'analyzed' as const
  if (input.hardFilter?.status === 'needs_review' || input.possibleDuplicate) return 'needs_review' as const
  return 'new' as const
}

export function activeQueueForOffer(queue: AnalysisQueueItem[], offerId: string) {
  return queue.find((item) => item.jobOfferId === offerId && (item.status === 'queued' || item.status === 'processing')) ?? null
}

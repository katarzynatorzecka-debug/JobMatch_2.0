import type { AnalysisEnqueueResult } from '../../contracts/workspace'
import { supabase } from '../supabase/client'
import type { WorkspaceRepository } from '../workspace/workspaceRepository'

export class AnalysisQueueError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AnalysisQueueError' }
}

export type AnalysisStartResult = AnalysisEnqueueResult & { status: 'completed' | 'in_progress' }

async function durableQueueStatus(repository: WorkspaceRepository, offerId: string, queueItemId: string): Promise<'completed' | 'in_progress' | null> {
  const details = await repository.loadOfferDetails(offerId)
  if (details.analysisState.latestVersion?.queueItemId === queueItemId) return 'completed'
  if (details.analysisState.queueItem?.id !== queueItemId) return null
  if (details.analysisState.queueItem.status === 'queued' || details.analysisState.queueItem.status === 'processing') return 'in_progress'
  if (details.analysisState.queueItem.status === 'completed') return 'completed'
  return null
}

export async function enqueueAndProcessAnalysis(repository: WorkspaceRepository, offerId: string, options?: { allowHardFilterFail?: boolean; forceReanalysis?: boolean }): Promise<AnalysisStartResult> {
  const result = options ? await repository.enqueueAnalysis(offerId, options) : await repository.enqueueAnalysis(offerId)
  if (result.reused) return { ...result, status: 'completed' }
  if (!supabase) throw new AnalysisQueueError('ANALYSIS_AUTH_REQUIRED', 'Analiza AI jest dostępna po zalogowaniu.')
  const { data, error } = await supabase.functions.invoke('analyze-job-match', { body: { queueItemId: result.queueItem.id } })
  if (error || (data && typeof data === 'object' && 'code' in data)) {
    const durableStatus = await durableQueueStatus(repository, offerId, result.queueItem.id).catch(() => null)
    if (durableStatus) return { ...result, status: durableStatus }
  }
  if (error) throw new AnalysisQueueError('EDGE_FUNCTION_HTTP_ERROR', 'Nie udało się uruchomić analizy AI. Możesz spróbować ponownie.')
  if (data && typeof data === 'object' && 'code' in data) throw new AnalysisQueueError(String(data.code), 'Analiza AI nie została ukończona. Możesz spróbować ponownie.')
  return { ...result, status: data && typeof data === 'object' && 'status' in data && data.status === 'completed' ? 'completed' : 'in_progress' }
}

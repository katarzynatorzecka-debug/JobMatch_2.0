import type { AnalysisEnqueueResult } from '../../contracts/workspace'
import type { UserProfile } from '../../contracts/profile'
import { supabase } from '../supabase/client'
import { evaluateOffer } from '../hardFilter/hardFilter'
import { importedJobOfferSchema } from '../../schemas/importSchemas'
import { validateUserProfile } from '../../schemas/profileSchemas'
import type { WorkspaceRepository } from '../workspace/workspaceRepository'

export class AnalysisQueueError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AnalysisQueueError' }
}

export type AnalysisStartResult = AnalysisEnqueueResult & { status: 'completed' | 'in_progress' }

const stableHash = (value: string) => { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }; return (hash >>> 0).toString(36) }

export async function prepareHardFilterForAnalysis(repository: WorkspaceRepository, offerId: string) {
  const details = await repository.loadOfferDetails(offerId)
  if (details.listItem?.hardFilter) return details.listItem.hardFilter.status
  if (!details.offer || !details.currentVersion) throw new AnalysisQueueError('WORKSPACE_OFFER_NOT_FOUND', 'Nie znaleziono aktualnej wersji oferty.')
  const workspace = await repository.loadWorkspace()
  const profile = validateUserProfile((workspace.profile?.profileData ?? {}) as Partial<UserProfile>)
  if (!profile.success) throw new AnalysisQueueError('WORKSPACE_PROFILE_VERSION_REQUIRED', 'Profil wymaga uzupełnienia przed analizą oferty.')
  const data = details.currentVersion.offerData as Record<string, unknown>
  const parsedOffer = importedJobOfferSchema.safeParse({ ...data, id: details.offer.id, title: data.title ?? details.offer.title, company: data.company ?? details.offer.company, location: data.location ?? details.offer.location ?? undefined, sourceUrl: data.sourceUrl ?? details.offer.sourceUrl ?? undefined, missingFields: data.missingFields ?? [], warnings: data.warnings ?? [] })
  if (!parsedOffer.success) throw new AnalysisQueueError('WORKSPACE_OFFER_DATA_INVALID', 'Oferta wymaga ponownego przygotowania przed analizą.')
  const hardFilter = evaluateOffer(profile.data, parsedOffer.data)
  await repository.persistHardFilterBatch({
    profile: profile.data,
    profileHash: stableHash(JSON.stringify(profile.data)),
    algorithmVersion: 'hard-filter-v1',
    items: [{ jobOfferId: details.offer.id, offerVersionId: details.currentVersion.id, status: hardFilter.status === 'weak' ? 'needs_review' : hardFilter.status, reasons: hardFilter.reasons, missingInformation: hardFilter.missingInformation, checkedCriteria: hardFilter.checkedCriteria }],
  })
  return hardFilter.status === 'weak' ? 'needs_review' : hardFilter.status
}

async function durableQueueStatus(repository: WorkspaceRepository, offerId: string, queueItemId: string): Promise<'completed' | 'in_progress' | null> {
  const details = await repository.loadOfferDetails(offerId)
  if (details.analysisState.latestVersion?.queueItemId === queueItemId) return 'completed'
  if (details.analysisState.queueItem?.id !== queueItemId) return null
  if (details.analysisState.queueItem.status === 'queued' || details.analysisState.queueItem.status === 'processing') return 'in_progress'
  if (details.analysisState.queueItem.status === 'completed') return 'completed'
  return null
}

export async function enqueueAndProcessAnalysis(repository: WorkspaceRepository, offerId: string, options?: { allowHardFilterFail?: boolean; forceReanalysis?: boolean; prepareHardFilter?: boolean }): Promise<AnalysisStartResult> {
  if (options?.prepareHardFilter) {
    const status = await prepareHardFilterForAnalysis(repository, offerId)
    if (status === 'fail' && !options.allowHardFilterFail) throw new AnalysisQueueError('WORKSPACE_ANALYSIS_BLOCKED_BY_HARD_FILTER', 'Oferta nie spełnia twardych kryteriów profilu.')
  }
  const { prepareHardFilter: _prepareHardFilter, ...enqueueOptions } = options ?? {}
  const result = options ? await repository.enqueueAnalysis(offerId, enqueueOptions) : await repository.enqueueAnalysis(offerId)
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

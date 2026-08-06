import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import type { JobAnalysis } from '../../contracts/jobAnalysis'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import { analysisEnqueueResultSchema, analysisQueueItemSchema, analysisVersionSchema, hardFilterResultSchema, importOfferLinkSchema, importSessionStatusSchema, offerUserStateSchema, offerVersionSchema, profileVersionSchema, recentlyViewedSchema, workspaceImportSessionSchema, workspaceJobAnalysisSchema, workspaceJobOfferSchema, workspaceProfileSchema } from '../../schemas/workspaceSchemas'
import { supabase } from '../supabase/client'
import { projectWorkspaceOfferDetails, projectWorkspaceOfferList } from './workspaceReadModel'
import { assertUniqueHardFilterItems, type HardFilterBatchInput, type LegacyAnalysisIssue, type ReactivateImportResult, type RevertImportResult, type WorkspaceImportInput, type WorkspaceRepository, type WorkspaceSnapshot } from './workspaceRepository'
import { parseHardFilterBatchResult, parseWorkspaceImportResult, WorkspaceRepositoryError } from './workspaceRpc'

const unavailable = () => new Error('Workspace w chmurze nie jest dostępny.')
const cloudError = (message: string) => new WorkspaceRepositoryError('WORKSPACE_IMPORT_FAILED', message)
const invalidResponse = (entity = 'workspace', paths: string[] = []) => new WorkspaceRepositoryError('WORKSPACE_INVALID_RESPONSE', `Nieprawidłowy rekord workspace: ${entity}${paths.length ? ` (${paths.join(', ')})` : ''}.`)
const rawRecordSchema = z.record(z.string(), z.unknown())
const mapRow = <T>(entity: string, row: unknown, schema: z.ZodType<T>, mapper: (raw: Record<string, unknown>) => unknown): T => {
  const raw = rawRecordSchema.safeParse(row)
  if (!raw.success) throw invalidResponse(entity, ['record'])
  const parsed = schema.safeParse(mapper(raw.data))
  if (!parsed.success) throw invalidResponse(entity, [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'record'))])
  return parsed.data
}
const mapSession = (row: unknown) => mapRow('import_sessions', row, workspaceImportSessionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, sourceType: raw.source_type, sourceFilename: raw.source_filename, status: raw.status, foundCount: raw.found_count, newCount: raw.new_count, duplicateCount: raw.duplicate_count, invalidCount: raw.invalid_count, needsReviewCount: raw.needs_review_count, warnings: raw.warnings ?? [], operationMetadata: raw.operation_metadata ?? {}, createdAt: raw.created_at, revertedAt: raw.reverted_at ?? null, reactivatedAt: raw.reactivated_at ?? null }))
const mapProfile = (row: unknown) => mapRow('profiles', row, workspaceProfileSchema, (raw) => ({ id: raw.id, userId: raw.user_id, profileData: raw.profile_data, currentVersionId: raw.current_version_id ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
const mapProfileVersion = (row: unknown) => mapRow('profile_versions', row, profileVersionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, profileId: raw.profile_id, versionNumber: raw.version_number, profileData: raw.profile_data, contentHash: raw.content_hash, createdAt: raw.created_at }))
export const mapOffer = (row: unknown) => mapRow('job_offers', row, workspaceJobOfferSchema, (raw) => ({ id: raw.id, userId: raw.user_id, sourceType: raw.source_type, sourceUrl: raw.source_url ?? null, normalizedSourceUrl: raw.normalized_source_url ?? null, canonicalFingerprint: raw.canonical_fingerprint ?? null, title: raw.title, company: raw.company, location: raw.location ?? null, currentData: raw.current_data ?? {}, sourceData: raw.source_data ?? null, firstSeenAt: raw.first_seen_at, lastSeenAt: raw.last_seen_at, currentVersionId: raw.current_version_id ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
const mapVersion = (row: unknown) => mapRow('offer_versions', row, offerVersionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, versionNumber: raw.version_number, offerData: raw.offer_data, contentHash: raw.content_hash, sourceUrl: raw.source_url ?? null, observedAt: raw.observed_at, importSessionId: raw.import_session_id ?? null, createdAt: raw.created_at }))
const mapLink = (row: unknown) => mapRow('import_offer_links', row, importOfferLinkSchema, (raw) => ({ id: raw.id, userId: raw.user_id, importSessionId: raw.import_session_id, jobOfferId: raw.job_offer_id, offerVersionId: raw.offer_version_id ?? null, matchType: raw.match_type, rawExternalId: raw.raw_external_id, dedupEvidence: raw.dedup_evidence ?? {}, isNew: raw.is_new, isDuplicate: raw.is_duplicate, needsReview: raw.needs_review, createdAt: raw.created_at }))
export const mapState = (row: unknown) => mapRow('offer_user_state', row, offerUserStateSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, lifecycleStatus: raw.lifecycle_status, favorite: raw.favorite, applied: raw.applied, exclusionReason: raw.exclusion_reason ?? null, stateMetadata: raw.state_metadata ?? {}, excludedAt: raw.excluded_at ?? null, restoredAt: raw.restored_at ?? null, lastViewedAt: raw.last_viewed_at ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
export const mapHardFilter = (row: unknown) => mapRow('hard_filter_results', row, hardFilterResultSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, offerVersionId: raw.offer_version_id, profileVersionId: raw.profile_version_id, status: raw.status, reasons: raw.reasons ?? [], missingInformation: raw.missing_information ?? [], checkedCriteria: raw.checked_criteria ?? [], algorithmVersion: raw.algorithm_version, createdAt: raw.created_at, isCurrent: raw.is_current }))
const mapViewed = (row: unknown) => mapRow('recently_viewed', row, recentlyViewedSchema, (raw) => ({ userId: raw.user_id, jobOfferId: raw.job_offer_id, viewedAt: raw.viewed_at }))
export const mapQueueItem = (row: unknown) => mapRow('analysis_queue', row, analysisQueueItemSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, offerVersionId: raw.offer_version_id, profileVersionId: raw.profile_version_id, hardFilterResultId: raw.hard_filter_result_id ?? null, status: raw.status, requestType: raw.request_type, requestedBy: raw.requested_by, attemptCount: raw.attempt_count, maxAttempts: raw.max_attempts, lockedAt: raw.locked_at ?? null, leaseExpiresAt: raw.lease_expires_at ?? null, workerToken: raw.worker_token ?? null, providerResponseId: raw.provider_response_id ?? null, lastError: raw.last_error ?? null, queuedAt: raw.queued_at, startedAt: raw.started_at ?? null, completedAt: raw.completed_at ?? null, cancelledAt: raw.cancelled_at ?? null, updatedAt: raw.updated_at }))
export const mapWorkspaceAnalysis = (row: unknown) => mapRow('workspace_job_analyses', row, workspaceJobAnalysisSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, latestVersionId: raw.latest_version_id ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
export const mapAnalysisVersion = (row: unknown) => mapRow('analysis_versions', row, analysisVersionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobAnalysisId: raw.job_analysis_id, jobOfferId: raw.job_offer_id, offerVersionId: raw.offer_version_id, profileVersionId: raw.profile_version_id, queueItemId: raw.queue_item_id ?? null, analysisData: raw.analysis_data, hardFilterStatus: raw.hard_filter_status, modelProvider: raw.model_provider, modelVersion: raw.model_version, promptVersion: raw.prompt_version ?? null, algorithmVersion: raw.algorithm_version, confidence: raw.confidence ?? null, coverage: raw.coverage ?? null, sourceType: raw.source_type, sourceQuality: raw.source_quality, createdAt: raw.created_at }))
const mapEnqueueResult = (row: unknown) => {
  const raw = rawRecordSchema.safeParse(row)
  if (!raw.success) throw invalidResponse()
  const parsed = analysisEnqueueResultSchema.safeParse({ queueItem: mapQueueItem(raw.data.queueItem), idempotent: raw.data.idempotent })
  if (!parsed.success) throw invalidResponse()
  return parsed.data
}

function mapLegacyAnalyses(rows: unknown[]): { analyses: JobAnalysis[]; issues: LegacyAnalysisIssue[] } {
  const analyses: JobAnalysis[] = []
  const issues: LegacyAnalysisIssue[] = []
  for (const row of rows) {
    const raw = rawRecordSchema.safeParse(row)
    if (!raw.success || typeof raw.data.job_offer_id !== 'string' || !raw.data.job_offer_id) throw invalidResponse('job_analyses', ['jobOfferId'])
    const parsed = validateJobAnalysis(raw.data.analysis_data)
    if (!parsed.success) { issues.push({ jobOfferId: raw.data.job_offer_id, code: 'WORKSPACE_LEGACY_ANALYSIS_INVALID' }); continue }
    if (parsed.data.offerId !== raw.data.job_offer_id) { issues.push({ jobOfferId: raw.data.job_offer_id, code: 'WORKSPACE_LEGACY_ANALYSIS_IDENTITY_MISMATCH' }); continue }
    analyses.push(parsed.data)
  }
  return { analyses, issues }
}

export function supabaseWorkspaceRepository(user: User): WorkspaceRepository {
  const client = supabase
  if (!client) throw unavailable()
  const rpc = async (name: string, args: Record<string, unknown>, message: string) => { const { data, error } = await client.rpc(name, args); if (error) throw cloudError(message); return data }
  const stateMutation = async (name: string, offerId: string, extra: Record<string, unknown> = {}) => { await rpc(name, { offer_id: offerId, ...extra }, 'Nie udało się zapisać stanu oferty.') }
  const sessionStatus = async (id: string) => { const { data, error } = await client.from('import_sessions').select('id,status').eq('user_id', user.id).eq('id', id).maybeSingle(); if (error) throw cloudError('Nie udało się odczytać statusu importu.'); if (!data) throw new WorkspaceRepositoryError('WORKSPACE_IMPORT_NOT_FOUND', 'Nie znaleziono importu workspace.'); const parsed = importSessionStatusSchema.safeParse(data.status); if (!parsed.success) throw invalidResponse(); return parsed.data }
  const loadWorkspace = async (): Promise<WorkspaceSnapshot> => {
    const [profile, profileVersions, sessions, links, offers, versions, states, hardFilters, analyses, queue, workspaceAnalyses, analysisVersions, viewed] = await Promise.all([
      client.from('profiles').select('id,user_id,profile_data,current_version_id,created_at,updated_at').eq('user_id', user.id).maybeSingle(),
      client.from('profile_versions').select('*').eq('user_id', user.id),
      client.from('import_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      client.from('import_offer_links').select('*').eq('user_id', user.id), client.from('job_offers').select('*').eq('user_id', user.id).not('current_version_id', 'is', null), client.from('offer_versions').select('*').eq('user_id', user.id), client.from('offer_user_state').select('*').eq('user_id', user.id),
      client.from('hard_filter_results').select('*').eq('user_id', user.id), client.from('job_analyses').select('job_offer_id,analysis_data').eq('user_id', user.id), client.from('analysis_queue').select('*').eq('user_id', user.id), client.from('workspace_job_analyses').select('*').eq('user_id', user.id), client.from('analysis_versions').select('*').eq('user_id', user.id), client.from('recently_viewed').select('*').eq('user_id', user.id),
    ])
    if ([profile.error, profileVersions.error, sessions.error, links.error, offers.error, versions.error, states.error, hardFilters.error, analyses.error, queue.error, workspaceAnalyses.error, analysisVersions.error, viewed.error].some(Boolean)) throw cloudError('Nie udało się odtworzyć workspace z chmury.')
    const activeIds = new Set((sessions.data ?? []).filter((row) => row.status !== 'reverted').map((row) => row.id))
    const legacyAnalysis = mapLegacyAnalyses(analyses.data ?? [])
    return { profile: profile.data ? mapProfile(profile.data) : null, profileVersions: (profileVersions.data ?? []).map(mapProfileVersion), importSessions: (sessions.data ?? []).map(mapSession), offers: (offers.data ?? []).map(mapOffer), activeOffers: (offers.data ?? []).filter((offer) => (links.data ?? []).some((link) => link.job_offer_id === offer.id && activeIds.has(link.import_session_id))).map(mapOffer), offerVersions: (versions.data ?? []).map(mapVersion), importOfferLinks: (links.data ?? []).map(mapLink), offerUserStates: (states.data ?? []).map(mapState), hardFilterResults: (hardFilters.data ?? []).map(mapHardFilter), analyses: legacyAnalysis.analyses, legacyAnalysisIssues: legacyAnalysis.issues, analysisQueue: (queue.data ?? []).map(mapQueueItem), workspaceAnalyses: (workspaceAnalyses.data ?? []).map(mapWorkspaceAnalysis), analysisVersions: (analysisVersions.data ?? []).map(mapAnalysisVersion), recentlyViewed: (viewed.data ?? []).map(mapViewed) }
  }
  return {
    loadWorkspace,
    async loadOfferList(includeHistorical = false) { return projectWorkspaceOfferList(await loadWorkspace(), includeHistorical) },
    async loadOfferDetails(offerId) { return projectWorkspaceOfferDetails(await loadWorkspace(), offerId) },
    async importReport(input) { return parseWorkspaceImportResult(await rpc('workspace_import_report', { payload: input }, 'Nie udało się zapisać importu workspace.')) },
    async persistHardFilterBatch(input: HardFilterBatchInput) { assertUniqueHardFilterItems(input.items); return parseHardFilterBatchResult(await rpc('workspace_persist_hard_filter_batch', { payload: input }, 'Nie udało się zapisać wyników Hard Filter.')) },
    async setFavorite(offerId, favorite) { await stateMutation('workspace_set_offer_favorite', offerId, { favorite }) },
    async setApplied(offerId, applied) { await stateMutation('workspace_set_offer_applied', offerId, { applied }) },
    async excludeOffer(offerId) { await stateMutation('workspace_exclude_offer', offerId) },
    async restoreOffer(offerId) { await stateMutation('workspace_restore_offer', offerId) },
    async markViewed(offerId) { await stateMutation('workspace_mark_offer_viewed', offerId) },
    async listImportSessions() { const { data, error } = await client.from('import_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }); if (error) throw cloudError('Nie udało się odczytać historii importów.'); return (data ?? []).map(mapSession) },
    async revertImport(importSessionId) { await rpc('workspace_revert_import', { import_session_id: importSessionId }, 'Nie udało się cofnąć importu.'); const status = await sessionStatus(importSessionId); if (status !== 'reverted') throw cloudError('Nieprawidłowy status cofnięcia importu.'); return { importSessionId, status } satisfies RevertImportResult },
    async reactivateImport(importSessionId) { await rpc('workspace_reactivate_import', { import_session_id: importSessionId }, 'Nie udało się przywrócić importu.'); const status = await sessionStatus(importSessionId); if (status === 'reverted') throw cloudError('Usługa workspace nie przywróciła importu.'); return { importSessionId, status } satisfies ReactivateImportResult },
    async enqueueAnalysis(offerId, options) { return mapEnqueueResult(await rpc(options?.allowHardFilterFail ? 'workspace_enqueue_analysis_override' : 'workspace_enqueue_analysis', { offer_id: offerId }, 'Nie udało się dodać oferty do kolejki AI.')) },
    async cancelQueuedAnalysis(queueItemId) { return mapEnqueueResult(await rpc('workspace_cancel_queued_analysis', { queue_item_id: queueItemId }, 'Nie udało się anulować kolejki AI.')) },
  }
}

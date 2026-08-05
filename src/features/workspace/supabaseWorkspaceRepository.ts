import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import { hardFilterResultSchema, importOfferLinkSchema, importSessionStatusSchema, offerUserStateSchema, offerVersionSchema, profileVersionSchema, recentlyViewedSchema, workspaceImportSessionSchema, workspaceJobOfferSchema, workspaceProfileSchema } from '../../schemas/workspaceSchemas'
import { supabase } from '../supabase/client'
import { projectWorkspaceOfferDetails, projectWorkspaceOfferList } from './workspaceReadModel'
import { assertUniqueHardFilterItems, type HardFilterBatchInput, type ReactivateImportResult, type RevertImportResult, type WorkspaceImportInput, type WorkspaceRepository, type WorkspaceSnapshot } from './workspaceRepository'
import { parseHardFilterBatchResult, parseWorkspaceImportResult, WorkspaceRepositoryError } from './workspaceRpc'

const unavailable = () => new Error('Workspace w chmurze nie jest dostępny.')
const cloudError = (message: string) => new WorkspaceRepositoryError('WORKSPACE_IMPORT_FAILED', message)
const invalidResponse = () => new WorkspaceRepositoryError('WORKSPACE_INVALID_RESPONSE', 'Workspace returned an invalid response.')
const rawRecordSchema = z.record(z.string(), z.unknown())
const mapRow = <T>(row: unknown, schema: z.ZodType<T>, mapper: (raw: Record<string, unknown>) => unknown): T => {
  const raw = rawRecordSchema.safeParse(row)
  if (!raw.success) throw invalidResponse()
  const parsed = schema.safeParse(mapper(raw.data))
  if (!parsed.success) throw invalidResponse()
  return parsed.data
}
const mapSession = (row: unknown) => mapRow(row, workspaceImportSessionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, sourceType: raw.source_type, sourceFilename: raw.source_filename, status: raw.status, foundCount: raw.found_count, newCount: raw.new_count, duplicateCount: raw.duplicate_count, invalidCount: raw.invalid_count, needsReviewCount: raw.needs_review_count, warnings: raw.warnings ?? [], operationMetadata: raw.operation_metadata ?? {}, createdAt: raw.created_at, revertedAt: raw.reverted_at ?? null, reactivatedAt: raw.reactivated_at ?? null }))
const mapProfile = (row: unknown) => mapRow(row, workspaceProfileSchema, (raw) => ({ id: raw.id, userId: raw.user_id, profileData: raw.profile_data, currentVersionId: raw.current_version_id ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
const mapProfileVersion = (row: unknown) => mapRow(row, profileVersionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, profileId: raw.profile_id, versionNumber: raw.version_number, profileData: raw.profile_data, contentHash: raw.content_hash, createdAt: raw.created_at }))
const mapOffer = (row: unknown) => mapRow(row, workspaceJobOfferSchema, (raw) => ({ id: raw.id, userId: raw.user_id, sourceType: raw.source_type, sourceUrl: raw.source_url ?? null, normalizedSourceUrl: raw.normalized_source_url ?? null, canonicalFingerprint: raw.canonical_fingerprint ?? null, title: raw.title, company: raw.company, location: raw.location ?? null, currentData: raw.current_data ?? {}, sourceData: raw.source_data ?? null, firstSeenAt: raw.first_seen_at, lastSeenAt: raw.last_seen_at, currentVersionId: raw.current_version_id ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
const mapVersion = (row: unknown) => mapRow(row, offerVersionSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, versionNumber: raw.version_number, offerData: raw.offer_data, contentHash: raw.content_hash, sourceUrl: raw.source_url ?? null, observedAt: raw.observed_at, importSessionId: raw.import_session_id ?? null, createdAt: raw.created_at }))
const mapLink = (row: unknown) => mapRow(row, importOfferLinkSchema, (raw) => ({ id: raw.id, userId: raw.user_id, importSessionId: raw.import_session_id, jobOfferId: raw.job_offer_id, offerVersionId: raw.offer_version_id ?? null, matchType: raw.match_type, rawExternalId: raw.raw_external_id, dedupEvidence: raw.dedup_evidence ?? {}, isNew: raw.is_new, isDuplicate: raw.is_duplicate, needsReview: raw.needs_review, createdAt: raw.created_at }))
export const mapState = (row: unknown) => mapRow(row, offerUserStateSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, lifecycleStatus: raw.lifecycle_status, favorite: raw.favorite, applied: raw.applied, exclusionReason: raw.exclusion_reason ?? null, stateMetadata: raw.state_metadata ?? {}, excludedAt: raw.excluded_at ?? null, restoredAt: raw.restored_at ?? null, lastViewedAt: raw.last_viewed_at ?? null, createdAt: raw.created_at, updatedAt: raw.updated_at }))
export const mapHardFilter = (row: unknown) => mapRow(row, hardFilterResultSchema, (raw) => ({ id: raw.id, userId: raw.user_id, jobOfferId: raw.job_offer_id, offerVersionId: raw.offer_version_id, profileVersionId: raw.profile_version_id, status: raw.status, reasons: raw.reasons ?? [], missingInformation: raw.missing_information ?? [], checkedCriteria: raw.checked_criteria ?? [], algorithmVersion: raw.algorithm_version, createdAt: raw.created_at, isCurrent: raw.is_current }))
const mapViewed = (row: unknown) => mapRow(row, recentlyViewedSchema, (raw) => ({ userId: raw.user_id, jobOfferId: raw.job_offer_id, viewedAt: raw.viewed_at }))

export function supabaseWorkspaceRepository(user: User): WorkspaceRepository {
  const client = supabase
  if (!client) throw unavailable()
  const rpc = async (name: string, args: Record<string, unknown>, message: string) => { const { data, error } = await client.rpc(name, args); if (error) throw cloudError(message); return data }
  const stateMutation = async (name: string, offerId: string, extra: Record<string, unknown> = {}) => { await rpc(name, { offer_id: offerId, ...extra }, 'Nie udało się zapisać stanu oferty.') }
  const sessionStatus = async (id: string) => { const { data, error } = await client.from('import_sessions').select('id,status').eq('user_id', user.id).eq('id', id).maybeSingle(); if (error) throw cloudError('Nie udało się odczytać statusu importu.'); if (!data) throw new WorkspaceRepositoryError('WORKSPACE_IMPORT_NOT_FOUND', 'Nie znaleziono importu workspace.'); const parsed = importSessionStatusSchema.safeParse(data.status); if (!parsed.success) throw invalidResponse(); return parsed.data }
  const loadWorkspace = async (): Promise<WorkspaceSnapshot> => {
    const [profile, profileVersions, sessions, links, offers, versions, states, hardFilters, analyses, viewed] = await Promise.all([
      client.from('profiles').select('id,user_id,profile_data,current_version_id,created_at,updated_at').eq('user_id', user.id).maybeSingle(),
      client.from('profile_versions').select('*').eq('user_id', user.id),
      client.from('import_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      client.from('import_offer_links').select('*').eq('user_id', user.id), client.from('job_offers').select('*').eq('user_id', user.id), client.from('offer_versions').select('*').eq('user_id', user.id), client.from('offer_user_state').select('*').eq('user_id', user.id),
      client.from('hard_filter_results').select('*').eq('user_id', user.id), client.from('job_analyses').select('analysis_data').eq('user_id', user.id), client.from('recently_viewed').select('*').eq('user_id', user.id),
    ])
    if ([profile.error, profileVersions.error, sessions.error, links.error, offers.error, versions.error, states.error, hardFilters.error, analyses.error, viewed.error].some(Boolean)) throw cloudError('Nie udało się odtworzyć workspace z chmury.')
    const activeIds = new Set((sessions.data ?? []).filter((row) => row.status !== 'reverted').map((row) => row.id))
    return { profile: profile.data ? mapProfile(profile.data) : null, profileVersions: (profileVersions.data ?? []).map(mapProfileVersion), importSessions: (sessions.data ?? []).map(mapSession), offers: (offers.data ?? []).map(mapOffer), activeOffers: (offers.data ?? []).filter((offer) => (links.data ?? []).some((link) => link.job_offer_id === offer.id && activeIds.has(link.import_session_id))).map(mapOffer), offerVersions: (versions.data ?? []).map(mapVersion), importOfferLinks: (links.data ?? []).map(mapLink), offerUserStates: (states.data ?? []).map(mapState), hardFilterResults: (hardFilters.data ?? []).map(mapHardFilter), analyses: (analyses.data ?? []).map((row) => validateJobAnalysis(row.analysis_data)).filter((entry) => entry.success).map((entry) => entry.data), recentlyViewed: (viewed.data ?? []).map(mapViewed) }
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
  }
}

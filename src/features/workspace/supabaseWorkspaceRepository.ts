import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'
import type { ReactivateImportResult, RevertImportResult, WorkspaceImportInput, WorkspaceOfferDetails, WorkspaceRepository, WorkspaceSnapshot } from './workspaceRepository'
import { parseWorkspaceImportResult, WorkspaceRepositoryError } from './workspaceRpc'

const unavailable = () => new Error('Workspace w chmurze nie jest dostępny.')
const cloudError = (message: string) => new WorkspaceRepositoryError('WORKSPACE_IMPORT_FAILED', message)

function mapSession(row: Record<string, unknown>) { return { id: row.id as string, userId: row.user_id as string, sourceType: row.source_type as string, sourceFilename: row.source_filename as string, status: row.status as 'active' | 'partial' | 'reverted', foundCount: row.found_count as number, newCount: row.new_count as number, duplicateCount: row.duplicate_count as number, invalidCount: row.invalid_count as number, needsReviewCount: row.needs_review_count as number, warnings: (row.warnings as unknown[]) ?? [], operationMetadata: (row.operation_metadata as Record<string, unknown>) ?? {}, createdAt: row.created_at as string, revertedAt: row.reverted_at as string | null, reactivatedAt: row.reactivated_at as string | null } }
function mapOffer(row: Record<string, unknown>) { return { id: row.id as string, userId: row.user_id as string, sourceType: row.source_type as string, sourceUrl: row.source_url as string | null, normalizedSourceUrl: row.normalized_source_url as string | null, canonicalFingerprint: row.canonical_fingerprint as string | null, title: row.title as string, company: row.company as string, location: row.location as string | null, currentData: (row.current_data as Record<string, unknown>) ?? {}, sourceData: row.source_data as Record<string, unknown> | null, firstSeenAt: row.first_seen_at as string, lastSeenAt: row.last_seen_at as string, currentVersionId: row.current_version_id as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string } }
function mapVersion(row: Record<string, unknown>) { return { id: row.id as string, userId: row.user_id as string, jobOfferId: row.job_offer_id as string, versionNumber: row.version_number as number, offerData: row.offer_data as Record<string, unknown>, contentHash: row.content_hash as string, sourceUrl: row.source_url as string | null, observedAt: row.observed_at as string, importSessionId: row.import_session_id as string | null, createdAt: row.created_at as string } }
function mapLink(row: Record<string, unknown>) { return { id: row.id as string, userId: row.user_id as string, importSessionId: row.import_session_id as string, jobOfferId: row.job_offer_id as string, offerVersionId: row.offer_version_id as string | null, matchType: row.match_type as 'exact_url' | 'canonical_high_confidence' | 'possible_duplicate' | 'new', rawExternalId: row.raw_external_id as string, dedupEvidence: (row.dedup_evidence as Record<string, unknown>) ?? {}, isNew: row.is_new as boolean, isDuplicate: row.is_duplicate as boolean, needsReview: row.needs_review as boolean, createdAt: row.created_at as string } }
function mapState(row: Record<string, unknown>) { return { id: row.id as string, userId: row.user_id as string, jobOfferId: row.job_offer_id as string, lifecycleStatus: row.lifecycle_status as 'new', favorite: row.favorite as boolean, applied: row.applied as boolean, exclusionReason: row.exclusion_reason as null, stateMetadata: (row.state_metadata as Record<string, unknown>) ?? {}, excludedAt: row.excluded_at as string | null, restoredAt: row.restored_at as string | null, lastViewedAt: row.last_viewed_at as string | null, createdAt: row.created_at as string, updatedAt: row.updated_at as string } }

export function supabaseWorkspaceRepository(user: User): WorkspaceRepository {
  const client = supabase
  if (!client) throw unavailable()

  const sessionStatus = async (importSessionId: string) => {
    const { data, error } = await client.from('import_sessions').select('id,status').eq('user_id', user.id).eq('id', importSessionId).maybeSingle()
    if (error) throw cloudError('Nie udało się odczytać statusu importu workspace.')
    if (!data) throw new WorkspaceRepositoryError('WORKSPACE_IMPORT_NOT_FOUND', 'Nie znaleziono importu workspace.')
    return data.status as 'active' | 'partial' | 'reverted'
  }

  return {
    async loadWorkspace() {
      const [profile, sessions, links, offers, versions, states, viewed] = await Promise.all([
        client.from('profiles').select('id,user_id,profile_data,current_version_id,created_at,updated_at').eq('user_id', user.id).maybeSingle(),
        client.from('import_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        client.from('import_offer_links').select('*').eq('user_id', user.id),
        client.from('job_offers').select('*').eq('user_id', user.id),
        client.from('offer_versions').select('*').eq('user_id', user.id),
        client.from('offer_user_state').select('*').eq('user_id', user.id),
        client.from('recently_viewed').select('*').eq('user_id', user.id),
      ])
      const errors = [profile.error, sessions.error, links.error, offers.error, versions.error, states.error, viewed.error].filter(Boolean)
      if (errors.length) throw cloudError('Nie udało się odtworzyć workspace z chmury.')
      const activeIds = new Set((sessions.data ?? []).filter((row) => row.status !== 'reverted').map((row) => row.id))
      return {
        profile: profile.data ? { id: profile.data.id, userId: profile.data.user_id, profileData: profile.data.profile_data, currentVersionId: profile.data.current_version_id, createdAt: profile.data.created_at, updatedAt: profile.data.updated_at } : null,
        importSessions: (sessions.data ?? []).map(mapSession),
        activeOffers: (offers.data ?? []).filter((offer) => (links.data ?? []).some((link) => link.job_offer_id === offer.id && activeIds.has(link.import_session_id))).map(mapOffer),
        offerVersions: (versions.data ?? []).map(mapVersion),
        importOfferLinks: (links.data ?? []).map(mapLink),
        offerUserStates: (states.data ?? []).map(mapState),
        recentlyViewed: (viewed.data ?? []).map((row) => ({ userId: row.user_id, jobOfferId: row.job_offer_id, viewedAt: row.viewed_at })),
      } satisfies WorkspaceSnapshot
    },
    async loadOfferDetails(offerId) {
      const [offer, versions, links, states, sessions] = await Promise.all([
        client.from('job_offers').select('*').eq('user_id', user.id).eq('id', offerId).maybeSingle(),
        client.from('offer_versions').select('*').eq('user_id', user.id).eq('job_offer_id', offerId),
        client.from('import_offer_links').select('*').eq('user_id', user.id).eq('job_offer_id', offerId),
        client.from('offer_user_state').select('*').eq('user_id', user.id).eq('job_offer_id', offerId).maybeSingle(),
        client.from('import_sessions').select('id,status').eq('user_id', user.id),
      ])
      if ([offer.error, versions.error, links.error, states.error, sessions.error].some(Boolean)) throw cloudError('Nie udało się odczytać szczegółów oferty workspace.')
      const occurrences = (links.data ?? []).map(mapLink)
      const activeIds = new Set((sessions.data ?? []).filter((row) => row.status !== 'reverted').map((row) => row.id))
      const mappedOffer = offer.data ? mapOffer(offer.data) : null
      const history = (versions.data ?? []).map(mapVersion).sort((left, right) => right.versionNumber - left.versionNumber)
      return { offer: mappedOffer, isActive: occurrences.some((item) => activeIds.has(item.importSessionId)), currentVersion: mappedOffer?.currentVersionId ? history.find((item) => item.id === mappedOffer.currentVersionId) ?? null : null, versionHistory: history, importOccurrences: occurrences, userState: states.data ? mapState(states.data) : null, analysisMetadata: [] } satisfies WorkspaceOfferDetails
    },
    async importReport(input) {
      const { data, error } = await client.rpc('workspace_import_report', { payload: input })
      if (error || !data) throw cloudError('Nie udało się zapisać importu workspace.')
      return parseWorkspaceImportResult(data)
    },
    async listImportSessions() {
      const { data, error } = await client.from('import_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) throw cloudError('Nie udało się odczytać historii importów.')
      return (data ?? []).map(mapSession)
    },
    async revertImport(importSessionId) {
      const { error } = await client.rpc('workspace_revert_import', { import_session_id: importSessionId })
      if (error) throw cloudError('Nie udało się cofnąć importu.')
      const status = await sessionStatus(importSessionId)
      if (status !== 'reverted') throw cloudError('Usługa workspace zwróciła nieprawidłowy status cofnięcia.')
      return { importSessionId, status } satisfies RevertImportResult
    },
    async reactivateImport(importSessionId) {
      const { error } = await client.rpc('workspace_reactivate_import', { import_session_id: importSessionId })
      if (error) throw cloudError('Nie udało się przywrócić importu.')
      const status = await sessionStatus(importSessionId)
      if (status === 'reverted') throw cloudError('Usługa workspace nie przywróciła importu.')
      return { importSessionId, status } satisfies ReactivateImportResult
    },
  }
}

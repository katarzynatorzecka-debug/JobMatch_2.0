import type { HardFilterResultRecord, ImportOfferLink, OfferUserState, OfferVersion, ProfileVersion, WorkspaceImportSession, WorkspaceJobOffer, WorkspaceProfile } from '../../contracts/workspace'
import { classifyDedupMatch } from './deduplication'
import { projectWorkspaceOfferDetails, projectWorkspaceOfferList } from './workspaceReadModel'
import { assertUniqueHardFilterItems, type HardFilterBatchInput, type HardFilterBatchResult, type ReactivateImportResult, type RevertImportResult, type WorkspaceImportInput, type WorkspaceImportResult, type WorkspaceOfferDetails, type WorkspaceRepository, type WorkspaceSnapshot } from './workspaceRepository'

const KEY = 'jobmatch.demo.workspace.v1'
type Store = { profile: WorkspaceProfile | null; profileVersions: ProfileVersion[]; sessions: WorkspaceImportSession[]; offers: WorkspaceJobOffer[]; versions: OfferVersion[]; links: ImportOfferLink[]; states: OfferUserState[]; hardFilters: HardFilterResultRecord[]; results: Record<string, WorkspaceImportResult>; viewed: Array<{ userId: string; jobOfferId: string; viewedAt: string }> }
const empty = (): Store => ({ profile: null, profileVersions: [], sessions: [], offers: [], versions: [], links: [], states: [], hardFilters: [], results: {}, viewed: [] })
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const id = (prefix: string, seed: string) => `${prefix}-${seed.replace(/[^a-z0-9]/gi, '').slice(-18) || Date.now().toString(36)}`

export function localWorkspaceRepository(userId = 'demo-user', storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof window === 'undefined' ? null : localStorage): WorkspaceRepository {
  const read = (): Store => { try { const raw = storage?.getItem(KEY); return raw ? { ...empty(), ...JSON.parse(raw) as Store } : empty() } catch { return empty() } }
  const write = (store: Store) => storage?.setItem(KEY, JSON.stringify(store))
  const snapshot = (store: Store): WorkspaceSnapshot => {
    const activeSessions = new Set(store.sessions.filter((session) => session.status !== 'reverted').map((session) => session.id))
    const activeOfferIds = new Set(store.links.filter((link) => activeSessions.has(link.importSessionId)).map((link) => link.jobOfferId))
    return { profile: copy(store.profile), profileVersions: copy(store.profileVersions), importSessions: copy(store.sessions), offers: copy(store.offers), activeOffers: copy(store.offers.filter((offer) => activeOfferIds.has(offer.id))), offerVersions: copy(store.versions), importOfferLinks: copy(store.links), offerUserStates: copy(store.states), hardFilterResults: copy(store.hardFilters), analyses: [], recentlyViewed: copy(store.viewed) }
  }
  const offerState = (store: Store, offerId: string) => { const state = store.states.find((item) => item.jobOfferId === offerId); if (!state) throw new Error('WORKSPACE_OFFER_NOT_FOUND'); return state }
  const touch = (state: OfferUserState) => { state.updatedAt = new Date().toISOString() }
  return {
    async loadWorkspace() { return snapshot(read()) },
    async loadOfferList(includeHistorical = false) { return projectWorkspaceOfferList(snapshot(read()), includeHistorical) },
    async loadOfferDetails(offerId) { return projectWorkspaceOfferDetails(snapshot(read()), offerId) satisfies WorkspaceOfferDetails },
    async importReport(input) {
      const store = read(); const existing = store.results[input.idempotencyKey]
      if (existing) { const session = store.sessions.find((item) => item.id === existing.importSessionId); if (!session) throw new Error('WORKSPACE_IMPORT_NOT_FOUND'); if (session.status === 'reverted') { session.status = session.invalidCount > 0 ? 'partial' : 'active'; session.reactivatedAt = new Date().toISOString(); session.operationMetadata = { ...session.operationMetadata, reactivatedAt: session.reactivatedAt }; write(store) }; return { ...copy(existing), status: session.status === 'partial' ? 'partial' : 'active', idempotent: true } }
      if (!input.items.length) throw new Error('WORKSPACE_VALID_ITEMS_REQUIRED')
      const next = copy(store); const now = input.importedAt; const sessionId = id('import', input.idempotencyKey); const createdOfferIds: string[] = []; const reusedOfferIds: string[] = []; const possibleDuplicateOfferIds: string[] = []
      for (const item of input.items) {
        const decision = classifyDedupMatch({ normalizedSourceUrl: item.normalizedSourceUrl, canonicalFingerprint: item.canonicalFingerprint, candidates: next.offers.map((offer) => ({ id: offer.id, normalizedSourceUrl: offer.normalizedSourceUrl, canonicalFingerprint: offer.canonicalFingerprint })) })
        let offer = decision.targetOfferId ? next.offers.find((candidate) => candidate.id === decision.targetOfferId)! : undefined; const isNew = !offer
        if (!offer) { const offerId = id('offer', `${sessionId}-${item.rawExternalId}`); offer = { id: offerId, userId, sourceType: input.sourceType, sourceUrl: item.sourceUrl, normalizedSourceUrl: item.normalizedSourceUrl, canonicalFingerprint: item.canonicalFingerprint, title: item.title, company: item.company, location: item.location, currentData: item.offerData, sourceData: null, firstSeenAt: now, lastSeenAt: now, currentVersionId: null, createdAt: now, updatedAt: now }; next.offers.push(offer); createdOfferIds.push(offerId); if (decision.matchType === 'possible_duplicate') possibleDuplicateOfferIds.push(offerId) } else { offer.lastSeenAt = now; offer.updatedAt = now; offer.currentData = item.offerData; reusedOfferIds.push(offer.id) }
        const current = offer.currentVersionId ? next.versions.find((version) => version.id === offer!.currentVersionId) : undefined; let version = current
        if (!version || version.contentHash !== item.contentHash) { version = { id: id('version', `${offer.id}-${item.contentHash}`), userId, jobOfferId: offer.id, versionNumber: (current?.versionNumber ?? 0) + 1, offerData: item.offerData, contentHash: item.contentHash, sourceUrl: item.sourceUrl, observedAt: now, importSessionId: sessionId, createdAt: now }; next.versions.push(version); offer.currentVersionId = version.id }
        next.links.push({ id: id('link', `${sessionId}-${item.rawExternalId}`), userId, importSessionId: sessionId, jobOfferId: offer.id, offerVersionId: version.id, matchType: decision.matchType, rawExternalId: item.rawExternalId, dedupEvidence: { candidateOfferIds: decision.candidateOfferIds }, isNew, isDuplicate: !isNew && decision.matchType !== 'possible_duplicate', needsReview: decision.matchType === 'possible_duplicate', createdAt: now })
        if (!next.states.some((state) => state.jobOfferId === offer!.id)) next.states.push({ id: id('state', offer.id), userId, jobOfferId: offer.id, lifecycleStatus: decision.matchType === 'possible_duplicate' ? 'needs_review' : 'new', favorite: false, applied: false, exclusionReason: null, stateMetadata: {}, excludedAt: null, restoredAt: null, lastViewedAt: null, createdAt: now, updatedAt: now })
      }
      const result: WorkspaceImportResult = { importSessionId: sessionId, foundCount: input.items.length + input.invalidItems.length, newCount: createdOfferIds.length, duplicateCount: reusedOfferIds.length, invalidCount: input.invalidItems.length, needsReviewCount: possibleDuplicateOfferIds.length, status: input.invalidItems.length ? 'partial' : 'active', createdOfferIds, reusedOfferIds, possibleDuplicateOfferIds, invalidItems: input.invalidItems, idempotent: false }
      next.sessions.push({ id: sessionId, userId, sourceType: input.sourceType, sourceFilename: input.fileName, status: result.status, foundCount: result.foundCount, newCount: result.newCount, duplicateCount: result.duplicateCount, invalidCount: result.invalidCount, needsReviewCount: result.needsReviewCount, warnings: input.warnings, operationMetadata: { idempotencyKey: input.idempotencyKey, parserVersion: input.parserVersion, invalidItems: input.invalidItems }, createdAt: now, revertedAt: null, reactivatedAt: null }); next.results[input.idempotencyKey] = result; write(next); return copy(result)
    },
    async persistHardFilterBatch(input: HardFilterBatchInput) {
      assertUniqueHardFilterItems(input.items)
      const store = read(); const now = new Date().toISOString(); const profileId = store.profile?.id ?? id('profile', userId); const current = store.profile
      const profileData = input.profile as unknown as Record<string, unknown>
      const currentVersion = current?.currentVersionId ? store.profileVersions.find((version) => version.id === current.currentVersionId) : undefined
      let profileVersion = currentVersion
      if (!profileVersion || profileVersion.contentHash !== input.profileHash) {
        profileVersion = store.profileVersions.find((version) => version.profileId === profileId && version.contentHash === input.profileHash)
        if (!profileVersion) {
          profileVersion = { id: id('profile-version', `${profileId}-${input.profileHash}`), userId, profileId, versionNumber: Math.max(0, ...store.profileVersions.filter((version) => version.profileId === profileId).map((version) => version.versionNumber)) + 1, profileData, contentHash: input.profileHash, createdAt: now }
          store.profileVersions.push(profileVersion)
        }
      }
      store.profile = { id: profileId, userId, profileData, currentVersionId: profileVersion.id, createdAt: current?.createdAt ?? now, updatedAt: now }
      const ids: string[] = []
      for (const item of input.items) {
        const offer = store.offers.find((entry) => entry.id === item.jobOfferId); const version = store.versions.find((entry) => entry.id === item.offerVersionId && entry.jobOfferId === item.jobOfferId); if (!offer || !version) throw new Error('WORKSPACE_OFFER_NOT_FOUND')
        store.hardFilters.forEach((entry) => { if (entry.jobOfferId === item.jobOfferId && entry.isCurrent) entry.isCurrent = false })
        const result: HardFilterResultRecord = { id: id('hard-filter', `${item.jobOfferId}-${now}`), userId, jobOfferId: item.jobOfferId, offerVersionId: item.offerVersionId, profileVersionId: profileVersion.id, status: item.status, reasons: item.reasons, missingInformation: item.missingInformation, checkedCriteria: item.checkedCriteria, algorithmVersion: input.algorithmVersion, createdAt: now, isCurrent: true }; store.hardFilters.push(result); ids.push(result.id)
        const state = offerState(store, item.jobOfferId)
        if (item.status === 'fail') { if (state.lifecycleStatus !== 'excluded') state.stateMetadata = { ...state.stateMetadata, previousLifecycleStatus: state.lifecycleStatus }; state.lifecycleStatus = 'excluded'; state.exclusionReason = 'hard_filter_fail'; state.excludedAt = now }
        else if (state.lifecycleStatus !== 'excluded' || state.exclusionReason === 'hard_filter_fail') { state.lifecycleStatus = item.status === 'needs_review' ? 'needs_review' : 'new'; state.exclusionReason = null; state.excludedAt = null; state.stateMetadata = { ...state.stateMetadata, previousLifecycleStatus: undefined } }
        touch(state)
      }
      write(store); return { profileVersionId: profileVersion.id, hardFilterResultIds: ids } satisfies HardFilterBatchResult
    },
    async setFavorite(offerId, favorite) { const store = read(); const state = offerState(store, offerId); state.favorite = favorite; touch(state); write(store) },
    async setApplied(offerId, applied) { const store = read(); const state = offerState(store, offerId); state.applied = applied; touch(state); write(store) },
    async excludeOffer(offerId) { const store = read(); const state = offerState(store, offerId); if (state.lifecycleStatus !== 'excluded') { state.stateMetadata = { ...state.stateMetadata, previousLifecycleStatus: state.lifecycleStatus }; state.lifecycleStatus = 'excluded'; state.exclusionReason = 'user_decision'; state.excludedAt = new Date().toISOString(); touch(state); write(store) } },
    async restoreOffer(offerId) { const store = read(); const state = offerState(store, offerId); const current = store.hardFilters.find((item) => item.jobOfferId === offerId && item.isCurrent); if (current?.status === 'fail') throw new Error('WORKSPACE_RESTORE_BLOCKED_BY_HARD_FILTER'); if (state.lifecycleStatus === 'excluded') { const previous = state.stateMetadata.previousLifecycleStatus; state.lifecycleStatus = previous === 'analyzed' || previous === 'needs_review' || previous === 'new' ? previous : current?.status === 'needs_review' ? 'needs_review' : 'new'; state.exclusionReason = null; state.restoredAt = new Date().toISOString(); touch(state); write(store) } },
    async markViewed(offerId) { const store = read(); const state = offerState(store, offerId); const now = new Date().toISOString(); state.lastViewedAt = now; touch(state); store.viewed = [...store.viewed.filter((item) => item.jobOfferId !== offerId), { userId, jobOfferId: offerId, viewedAt: now }]; write(store) },
    async listImportSessions() { return copy(read().sessions) },
    async revertImport(importSessionId) { const store = read(); const session = store.sessions.find((item) => item.id === importSessionId); if (!session) throw new Error('WORKSPACE_IMPORT_NOT_FOUND'); if (session.status !== 'reverted') { session.status = 'reverted'; session.revertedAt = new Date().toISOString(); session.operationMetadata = { ...session.operationMetadata, revertedAt: session.revertedAt }; write(store) }; return { importSessionId, status: 'reverted' } satisfies RevertImportResult },
    async reactivateImport(importSessionId) { const store = read(); const session = store.sessions.find((item) => item.id === importSessionId); if (!session) throw new Error('WORKSPACE_IMPORT_NOT_FOUND'); if (session.status === 'reverted') { session.status = session.invalidCount > 0 ? 'partial' : 'active'; session.reactivatedAt = new Date().toISOString(); session.operationMetadata = { ...session.operationMetadata, reactivatedAt: session.reactivatedAt }; write(store) }; return { importSessionId, status: session.status === 'partial' ? 'partial' : 'active' } satisfies ReactivateImportResult },
  }
}

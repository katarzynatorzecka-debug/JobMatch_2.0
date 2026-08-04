import type { ImportOfferLink, OfferUserState, OfferVersion, WorkspaceImportSession, WorkspaceJobOffer } from '../../contracts/workspace'
import { classifyDedupMatch } from './deduplication'
import type { ReactivateImportResult, RevertImportResult, WorkspaceImportInput, WorkspaceImportResult, WorkspaceOfferDetails, WorkspaceRepository, WorkspaceSnapshot } from './workspaceRepository'

const KEY = 'jobmatch.demo.workspace.v1'
type Store = { sessions: WorkspaceImportSession[]; offers: WorkspaceJobOffer[]; versions: OfferVersion[]; links: ImportOfferLink[]; states: OfferUserState[]; results: Record<string, WorkspaceImportResult> }
const empty = (): Store => ({ sessions: [], offers: [], versions: [], links: [], states: [], results: {} })
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const id = (prefix: string, seed: string) => `${prefix}-${seed.replace(/[^a-z0-9]/gi, '').slice(-18) || Date.now().toString(36)}`

export function localWorkspaceRepository(userId = 'demo-user', storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof window === 'undefined' ? null : localStorage): WorkspaceRepository {
  const read = (): Store => { try { const raw = storage?.getItem(KEY); return raw ? JSON.parse(raw) as Store : empty() } catch { return empty() } }
  const write = (store: Store) => storage?.setItem(KEY, JSON.stringify(store))
  const snapshot = (store: Store): WorkspaceSnapshot => {
    const activeSessions = new Set(store.sessions.filter((session) => session.status !== 'reverted').map((session) => session.id))
    const activeOfferIds = new Set(store.links.filter((link) => activeSessions.has(link.importSessionId)).map((link) => link.jobOfferId))
    return { profile: null, importSessions: copy(store.sessions), activeOffers: copy(store.offers.filter((offer) => activeOfferIds.has(offer.id))), offerVersions: copy(store.versions), importOfferLinks: copy(store.links), offerUserStates: copy(store.states), recentlyViewed: [] }
  }
  return {
    async loadWorkspace() { return snapshot(read()) },
    async loadOfferDetails(offerId) { const store = read(); const offer = store.offers.find((item) => item.id === offerId) ?? null; const versions = store.versions.filter((item) => item.jobOfferId === offerId).sort((a, b) => b.versionNumber - a.versionNumber); const occurrences = store.links.filter((item) => item.jobOfferId === offerId); const activeSessions = new Set(store.sessions.filter((session) => session.status !== 'reverted').map((session) => session.id)); return { offer: copy(offer), isActive: occurrences.some((item) => activeSessions.has(item.importSessionId)), currentVersion: offer?.currentVersionId ? copy(versions.find((item) => item.id === offer.currentVersionId) ?? null) : null, versionHistory: copy(versions), importOccurrences: copy(occurrences), userState: copy(store.states.find((item) => item.jobOfferId === offerId) ?? null), analysisMetadata: [] } satisfies WorkspaceOfferDetails },
    async importReport(input) {
      const store = read(); const existing = store.results[input.idempotencyKey]
      if (existing) { const session = store.sessions.find((item) => item.id === existing.importSessionId); if (!session) throw new Error('WORKSPACE_IMPORT_NOT_FOUND'); if (session.status === 'reverted') { session.status = session.invalidCount > 0 ? 'partial' : 'active'; session.reactivatedAt = new Date().toISOString(); session.operationMetadata = { ...session.operationMetadata, reactivatedAt: session.reactivatedAt }; write(store) }; return { ...copy(existing), status: session.status === 'partial' ? 'partial' : 'active', idempotent: true } }
      if (!input.items.length) throw new Error('Import nie zawiera poprawnych ofert.')
      const next = copy(store); const now = input.importedAt; const sessionId = id('import', input.idempotencyKey)
      const createdOfferIds: string[] = []; const reusedOfferIds: string[] = []; const possibleDuplicateOfferIds: string[] = []
      for (const item of input.items) {
        const decision = classifyDedupMatch({ normalizedSourceUrl: item.normalizedSourceUrl, canonicalFingerprint: item.canonicalFingerprint, candidates: next.offers.map((offer) => ({ id: offer.id, normalizedSourceUrl: offer.normalizedSourceUrl, canonicalFingerprint: offer.canonicalFingerprint })) })
        let offer = decision.targetOfferId ? next.offers.find((candidate) => candidate.id === decision.targetOfferId)! : undefined
        const isNew = !offer
        if (!offer) {
          const offerId = id('offer', `${sessionId}-${item.rawExternalId}`); offer = { id: offerId, userId, sourceType: input.sourceType, sourceUrl: item.sourceUrl, normalizedSourceUrl: item.normalizedSourceUrl, canonicalFingerprint: item.canonicalFingerprint, title: item.title, company: item.company, location: item.location, currentData: item.offerData, sourceData: null, firstSeenAt: now, lastSeenAt: now, currentVersionId: null, createdAt: now, updatedAt: now }; next.offers.push(offer); createdOfferIds.push(offerId); if (decision.matchType === 'possible_duplicate') possibleDuplicateOfferIds.push(offerId)
        } else { offer.lastSeenAt = now; offer.updatedAt = now; offer.currentData = item.offerData; reusedOfferIds.push(offer.id) }
        const current = offer.currentVersionId ? next.versions.find((version) => version.id === offer!.currentVersionId) : undefined
        let version = current
        if (!version || version.contentHash !== item.contentHash) { version = { id: id('version', `${offer.id}-${item.contentHash}`), userId, jobOfferId: offer.id, versionNumber: (current?.versionNumber ?? 0) + 1, offerData: item.offerData, contentHash: item.contentHash, sourceUrl: item.sourceUrl, observedAt: now, importSessionId: sessionId, createdAt: now }; next.versions.push(version); offer.currentVersionId = version.id }
        const link: ImportOfferLink = { id: id('link', `${sessionId}-${item.rawExternalId}`), userId, importSessionId: sessionId, jobOfferId: offer.id, offerVersionId: version.id, matchType: decision.matchType, rawExternalId: item.rawExternalId, dedupEvidence: { candidateOfferIds: decision.candidateOfferIds }, isNew, isDuplicate: !isNew && decision.matchType !== 'possible_duplicate', needsReview: decision.matchType === 'possible_duplicate', createdAt: now }; next.links.push(link)
        if (!next.states.some((state) => state.jobOfferId === offer!.id)) next.states.push({ id: id('state', offer.id), userId, jobOfferId: offer.id, lifecycleStatus: 'new', favorite: false, applied: false, exclusionReason: null, stateMetadata: {}, excludedAt: null, restoredAt: null, lastViewedAt: null, createdAt: now, updatedAt: now })
      }
      const result: WorkspaceImportResult = { importSessionId: sessionId, foundCount: input.items.length + input.invalidItems.length, newCount: createdOfferIds.length, duplicateCount: reusedOfferIds.length, invalidCount: input.invalidItems.length, needsReviewCount: possibleDuplicateOfferIds.length, status: input.invalidItems.length ? 'partial' : 'active', createdOfferIds, reusedOfferIds, possibleDuplicateOfferIds, invalidItems: input.invalidItems, idempotent: false }
      next.sessions.push({ id: sessionId, userId, sourceType: input.sourceType, sourceFilename: input.fileName, status: result.status, foundCount: result.foundCount, newCount: result.newCount, duplicateCount: result.duplicateCount, invalidCount: result.invalidCount, needsReviewCount: result.needsReviewCount, warnings: input.warnings, operationMetadata: { idempotencyKey: input.idempotencyKey, parserVersion: input.parserVersion, invalidItems: input.invalidItems }, createdAt: now, revertedAt: null, reactivatedAt: null }); next.results[input.idempotencyKey] = result; write(next); return copy(result)
    },
    async listImportSessions() { return copy(read().sessions) },
    async revertImport(importSessionId) { const store = read(); const session = store.sessions.find((item) => item.id === importSessionId); if (!session) throw new Error('WORKSPACE_IMPORT_NOT_FOUND'); if (session.status !== 'reverted') { session.status = 'reverted'; session.revertedAt = new Date().toISOString(); session.operationMetadata = { ...session.operationMetadata, revertedAt: session.revertedAt }; write(store) }; return { importSessionId, status: 'reverted' } satisfies RevertImportResult },
    async reactivateImport(importSessionId) { const store = read(); const session = store.sessions.find((item) => item.id === importSessionId); if (!session) throw new Error('WORKSPACE_IMPORT_NOT_FOUND'); if (session.status === 'reverted') { session.status = session.invalidCount > 0 ? 'partial' : 'active'; session.reactivatedAt = new Date().toISOString(); session.operationMetadata = { ...session.operationMetadata, reactivatedAt: session.reactivatedAt }; write(store) }; return { importSessionId, status: session.status === 'partial' ? 'partial' : 'active' } satisfies ReactivateImportResult },
  }
}

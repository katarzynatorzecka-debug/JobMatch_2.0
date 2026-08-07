import type { JobAnalysis } from '../../contracts/jobAnalysis'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import type { AnalysisVersion, HardFilterResultRecord, ImportOfferLink, OfferUserState, OfferVersion, WorkspaceImportSession, WorkspaceJobOffer } from '../../contracts/workspace'
import type { WorkspaceOfferDetails, WorkspaceOfferListItem, WorkspaceSnapshot } from './workspaceRepository'
import { activeQueueForOffer, analysisFreshness, queueLifecycle } from './analysisQueue'

function currentVersion(offer: WorkspaceJobOffer, versions: OfferVersion[]) { return offer.currentVersionId ? versions.find((version) => version.id === offer.currentVersionId) ?? null : null }
function currentHardFilter(offerId: string, results: HardFilterResultRecord[]) { return results.find((result) => result.jobOfferId === offerId && result.isCurrent) ?? null }
function linksFor(offerId: string, links: ImportOfferLink[]) { return links.filter((link) => link.jobOfferId === offerId) }
function activeSessions(snapshot: WorkspaceSnapshot) { return new Set(snapshot.importSessions.filter((session) => session.status !== 'reverted').map((session) => session.id)) }
function latestActiveImportSessionAt(offerId: string, snapshot: WorkspaceSnapshot): string | null {
  const active = activeSessions(snapshot)
  const sessions = linksFor(offerId, snapshot.importOfferLinks)
    .map((link) => snapshot.importSessions.find((session) => session.id === link.importSessionId))
    .filter((session): session is WorkspaceImportSession => Boolean(session && active.has(session.id) && Number.isFinite(Date.parse(session.createdAt))))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id))
  return sessions[0]?.createdAt ?? null
}
function analysisFor(offerId: string, analyses: JobAnalysis[]) { return analyses.find((analysis) => analysis.offerId === offerId) ?? null }
type VersionedAnalysisProjection = { latestVersion: AnalysisVersion | null; analysis: JobAnalysis | null; errorCode: string | null }

function latestVersionFor(offerId: string, snapshot: WorkspaceSnapshot): VersionedAnalysisProjection {
  const analyses = snapshot.workspaceAnalyses.filter((item) => item.jobOfferId === offerId)
  if (analyses.length > 1) return { latestVersion: null, analysis: null, errorCode: 'WORKSPACE_ANALYSIS_IDENTITY_CONFLICT' }
  const workspaceAnalysis = analyses[0]
  if (!workspaceAnalysis?.latestVersionId) return { latestVersion: null, analysis: null, errorCode: null }
  const latestVersion = snapshot.analysisVersions.find((item) => item.id === workspaceAnalysis.latestVersionId) ?? null
  if (!latestVersion) return { latestVersion: null, analysis: null, errorCode: 'WORKSPACE_ANALYSIS_VERSION_NOT_FOUND' }
  if (latestVersion.jobOfferId !== offerId) return { latestVersion, analysis: null, errorCode: 'WORKSPACE_ANALYSIS_IDENTITY_MISMATCH' }
  const parsed = validateJobAnalysis(latestVersion.analysisData)
  if (!parsed.success || parsed.data.offerId !== offerId) return { latestVersion, analysis: null, errorCode: 'WORKSPACE_ANALYSIS_INVALID_RESPONSE' }
  return { latestVersion, analysis: parsed.data, errorCode: null }
}

export function projectWorkspaceOffer(snapshot: WorkspaceSnapshot, offer: WorkspaceJobOffer): WorkspaceOfferListItem {
  const links = linksFor(offer.id, snapshot.importOfferLinks)
  const active = activeSessions(snapshot)
  const importSessionIds = [...new Set(links.map((link) => link.importSessionId))]
  const latestImportSessionAt = latestActiveImportSessionAt(offer.id, snapshot)
  const hardFilter = currentHardFilter(offer.id, snapshot.hardFilterResults)
  const versionedAnalysis = latestVersionFor(offer.id, snapshot)
  const { latestVersion } = versionedAnalysis
  const legacyAnalysis = analysisFor(offer.id, snapshot.analyses)
  const legacyIssue = snapshot.legacyAnalysisIssues.find((issue) => issue.jobOfferId === offer.id) ?? null
  const analysis = latestVersion || versionedAnalysis.errorCode || legacyIssue ? versionedAnalysis.analysis : legacyAnalysis
  const queueItem = activeQueueForOffer(snapshot.analysisQueue, offer.id)
  const storedState = snapshot.offerUserStates.find((state) => state.jobOfferId === offer.id) ?? null
  const userState = storedState ? {
    ...storedState,
      lifecycleStatus: queueLifecycle({
        current: storedState,
        hardFilter,
        queueItem,
        hasCurrentAnalysis: Boolean(versionedAnalysis.analysis ?? legacyAnalysis),
      possibleDuplicate: links.some((link) => link.needsReview || link.matchType === 'possible_duplicate'),
    }),
  } : null
  return {
    offer,
    currentVersion: currentVersion(offer, snapshot.offerVersions),
    userState,
    hardFilter,
    analysis,
    analysisState: {
      queueItem,
      latestVersion,
      freshness: analysisFreshness({ latestVersion, profile: snapshot.profile, offerVersionId: offer.currentVersionId, hardFilter }),
      lastAnalysisAt: latestVersion?.createdAt ?? legacyAnalysis?.createdAt ?? null,
      errorCode: versionedAnalysis.errorCode ?? legacyIssue?.code ?? queueItem?.lastError ?? snapshot.analysisQueue.find((item) => item.jobOfferId === offer.id && item.status === 'failed')?.lastError ?? null,
      isLegacyFallback: Boolean(!latestVersion && !versionedAnalysis.errorCode && !legacyIssue && legacyAnalysis),
    },
    activeImportCount: importSessionIds.filter((id) => active.has(id)).length,
    importSessionIds,
    latestImportSessionAt,
    isActive: importSessionIds.some((id) => active.has(id)),
  }
}

export function projectWorkspaceOfferList(snapshot: WorkspaceSnapshot, includeHistorical = false) {
  const canonicalOffers = snapshot.offers.filter((offer, index, offers) => offers.findIndex((candidate) => candidate.id === offer.id) === index)
  return canonicalOffers
    .map((offer) => projectWorkspaceOffer(snapshot, offer))
    .filter((item) => includeHistorical || item.isActive)
    .sort((left, right) => {
      const rightReportAt = right.latestImportSessionAt
      const leftReportAt = left.latestImportSessionAt
      if (rightReportAt && leftReportAt && rightReportAt !== leftReportAt) return rightReportAt.localeCompare(leftReportAt)
      if (rightReportAt !== leftReportAt) return rightReportAt ? -1 : 1
      return right.offer.id.localeCompare(left.offer.id)
    })
}

export function projectWorkspaceOfferDetails(snapshot: WorkspaceSnapshot, offerId: string): WorkspaceOfferDetails {
  const offer = snapshot.offers.find((item) => item.id === offerId) ?? null
  if (!offer) return { offer: null, isActive: false, currentVersion: null, versionHistory: [], importOccurrences: [], userState: null, analysisMetadata: [], analysisHistory: [], analysisState: { queueItem: null, latestVersion: null, freshness: 'missing', lastAnalysisAt: null, errorCode: null, isLegacyFallback: false }, listItem: null }
  const listItem = projectWorkspaceOffer(snapshot, offer)
  return {
    offer,
    isActive: listItem.isActive,
    currentVersion: listItem.currentVersion,
    versionHistory: snapshot.offerVersions.filter((version) => version.jobOfferId === offerId).sort((left, right) => right.versionNumber - left.versionNumber),
    importOccurrences: linksFor(offerId, snapshot.importOfferLinks),
    userState: listItem.userState,
    analysisMetadata: listItem.analysis ? [listItem.analysis] : [],
    analysisHistory: snapshot.analysisVersions.filter((version) => version.jobOfferId === offerId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    analysisState: listItem.analysisState,
    listItem,
  }
}

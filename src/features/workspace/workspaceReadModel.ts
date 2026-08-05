import type { JobAnalysis } from '../../contracts/jobAnalysis'
import type { HardFilterResultRecord, ImportOfferLink, OfferUserState, OfferVersion, WorkspaceJobOffer } from '../../contracts/workspace'
import type { WorkspaceOfferDetails, WorkspaceOfferListItem, WorkspaceSnapshot } from './workspaceRepository'
import { resolveLifecycle } from './workspaceLifecycle'

function currentVersion(offer: WorkspaceJobOffer, versions: OfferVersion[]) { return offer.currentVersionId ? versions.find((version) => version.id === offer.currentVersionId) ?? null : null }
function currentHardFilter(offerId: string, results: HardFilterResultRecord[]) { return results.find((result) => result.jobOfferId === offerId && result.isCurrent) ?? null }
function linksFor(offerId: string, links: ImportOfferLink[]) { return links.filter((link) => link.jobOfferId === offerId) }
function activeSessions(snapshot: WorkspaceSnapshot) { return new Set(snapshot.importSessions.filter((session) => session.status !== 'reverted').map((session) => session.id)) }
function analysisFor(offerId: string, analyses: JobAnalysis[]) { return analyses.find((analysis) => analysis.offerId === offerId) ?? null }

export function projectWorkspaceOffer(snapshot: WorkspaceSnapshot, offer: WorkspaceJobOffer): WorkspaceOfferListItem {
  const links = linksFor(offer.id, snapshot.importOfferLinks)
  const active = activeSessions(snapshot)
  const importSessionIds = [...new Set(links.map((link) => link.importSessionId))]
  const hardFilter = currentHardFilter(offer.id, snapshot.hardFilterResults)
  const analysis = analysisFor(offer.id, snapshot.analyses)
  const storedState = snapshot.offerUserStates.find((state) => state.jobOfferId === offer.id) ?? null
  const userState = storedState ? {
    ...storedState,
    lifecycleStatus: resolveLifecycle({
      current: storedState,
      hardFilter,
      hasAnalysis: Boolean(analysis),
      possibleDuplicate: links.some((link) => link.needsReview || link.matchType === 'possible_duplicate'),
    }),
  } : null
  return {
    offer,
    currentVersion: currentVersion(offer, snapshot.offerVersions),
    userState,
    hardFilter,
    analysis,
    activeImportCount: importSessionIds.filter((id) => active.has(id)).length,
    importSessionIds,
    isActive: importSessionIds.some((id) => active.has(id)),
  }
}

export function projectWorkspaceOfferList(snapshot: WorkspaceSnapshot, includeHistorical = false) {
  return snapshot.offers
    .map((offer) => projectWorkspaceOffer(snapshot, offer))
    .filter((item) => includeHistorical || item.isActive)
}

export function projectWorkspaceOfferDetails(snapshot: WorkspaceSnapshot, offerId: string): WorkspaceOfferDetails {
  const offer = snapshot.offers.find((item) => item.id === offerId) ?? null
  if (!offer) return { offer: null, isActive: false, currentVersion: null, versionHistory: [], importOccurrences: [], userState: null, analysisMetadata: [], listItem: null }
  const listItem = projectWorkspaceOffer(snapshot, offer)
  return {
    offer,
    isActive: listItem.isActive,
    currentVersion: listItem.currentVersion,
    versionHistory: snapshot.offerVersions.filter((version) => version.jobOfferId === offerId).sort((left, right) => right.versionNumber - left.versionNumber),
    importOccurrences: linksFor(offerId, snapshot.importOfferLinks),
    userState: listItem.userState,
    analysisMetadata: listItem.analysis ? [listItem.analysis] : [],
    listItem,
  }
}

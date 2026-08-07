import type { WorkspaceOfferListItem } from './workspaceRepository'

export type OfferListFilter = 'all' | 'pass' | 'needs_review' | 'fail'
export type OfferListSort = 'newest' | 'oldest' | 'score_desc' | 'score_asc'
export type OfferListQuery = { hardFilter: OfferListFilter; sourceType: string; importSessionId: string; showExcluded: boolean }

export const defaultOfferListQuery: OfferListQuery = { hardFilter: 'all', sourceType: '', importSessionId: '', showExcluded: false }

export function offerImportDate(item: WorkspaceOfferListItem) {
  return item.offer.lastSeenAt || item.offer.firstSeenAt || item.offer.createdAt
}

export function filterWorkspaceOffers(items: WorkspaceOfferListItem[], query: OfferListQuery) {
  return items.filter((item) => {
    const hardFilterMatch = query.hardFilter === 'all' || item.hardFilter?.status === query.hardFilter
    const sourceMatch = !query.sourceType || item.offer.sourceType === query.sourceType
    const reportMatch = !query.importSessionId || item.importSessionIds.includes(query.importSessionId)
    const hiddenManualExclusion = item.userState?.lifecycleStatus === 'excluded' && item.userState.exclusionReason !== 'hard_filter_fail'
    const exclusionVisible = query.showExcluded || !hiddenManualExclusion
    return hardFilterMatch && sourceMatch && reportMatch && exclusionVisible
  })
}

function compareImportDate(left: WorkspaceOfferListItem, right: WorkspaceOfferListItem) {
  const difference = Date.parse(offerImportDate(right)) - Date.parse(offerImportDate(left))
  return Number.isFinite(difference) && difference !== 0 ? difference : right.offer.id.localeCompare(left.offer.id)
}

export function sortWorkspaceOffers(items: WorkspaceOfferListItem[], sort: OfferListSort) {
  return [...items].sort((left, right) => {
    if (sort === 'score_desc' || sort === 'score_asc') {
      const leftScore = left.analysis?.overallScore ?? null
      const rightScore = right.analysis?.overallScore ?? null
      if (leftScore === null && rightScore !== null) return 1
      if (leftScore !== null && rightScore === null) return -1
      if (leftScore !== null && rightScore !== null && leftScore !== rightScore) return sort === 'score_desc' ? rightScore - leftScore : leftScore - rightScore
    }
    const chronological = compareImportDate(left, right)
    return sort === 'oldest' ? -chronological : chronological
  })
}

export function visibleWorkspaceOffers(items: WorkspaceOfferListItem[], filter: OfferListFilter, showExcluded: boolean) {
  return filterWorkspaceOffers(items, { ...defaultOfferListQuery, hardFilter: filter, showExcluded })
}

export function listWorkspaceOffers(items: WorkspaceOfferListItem[], query: OfferListQuery, sort: OfferListSort) {
  return sortWorkspaceOffers(filterWorkspaceOffers(items, query), sort)
}

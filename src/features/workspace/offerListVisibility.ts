import type { WorkspaceOfferListItem } from './workspaceRepository'

export type OfferListFilter = 'all' | 'pass' | 'needs_review' | 'fail'
export type OfferListSort = 'newest' | 'oldest' | 'score_desc' | 'score_asc'
export type OfferListScope = 'active' | 'historical'
export type OfferListQuery = { scope: OfferListScope; hardFilter: OfferListFilter; sourceType: string; importSessionId: string; showExcluded: boolean }

export const defaultOfferListQuery: OfferListQuery = { scope: 'active', hardFilter: 'all', sourceType: '', importSessionId: '', showExcluded: false }

export function offerImportDate(item: WorkspaceOfferListItem) {
  return item.latestImportSessionAt
}

export function filterWorkspaceOffers(items: WorkspaceOfferListItem[], query: OfferListQuery) {
  return items.filter((item) => {
    const scopeMatch = query.scope === 'historical' ? item.isActive === false : item.isActive !== false
    const hardFilterMatch = query.hardFilter === 'all' || item.hardFilter?.status === query.hardFilter
    const sourceMatch = !query.sourceType || item.offer.sourceType === query.sourceType
    const reportMatch = !query.importSessionId || item.importSessionIds.includes(query.importSessionId)
    const hiddenManualExclusion = item.userState?.lifecycleStatus === 'excluded' && item.userState.exclusionReason !== 'hard_filter_fail'
    const exclusionVisible = query.showExcluded || !hiddenManualExclusion
    return scopeMatch && hardFilterMatch && sourceMatch && reportMatch && exclusionVisible
  })
}

function compareImportDate(left: WorkspaceOfferListItem, right: WorkspaceOfferListItem) {
  const leftTimestamp = offerImportDate(left) ? Date.parse(offerImportDate(left)!) : Number.NaN
  const rightTimestamp = offerImportDate(right) ? Date.parse(offerImportDate(right)!) : Number.NaN
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp
  if (Number.isFinite(leftTimestamp) !== Number.isFinite(rightTimestamp)) return Number.isFinite(leftTimestamp) ? -1 : 1
  return right.offer.id.localeCompare(left.offer.id)
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

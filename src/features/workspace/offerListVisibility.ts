import type { WorkspaceOfferListItem } from './workspaceRepository'

export type OfferListFilter = 'all' | 'pass' | 'needs_review' | 'fail'

export function visibleWorkspaceOffers(items: WorkspaceOfferListItem[], filter: OfferListFilter, showExcluded: boolean) {
  return items.filter((item) => {
    const hardFilterMatch = filter === 'all' || item.hardFilter?.status === filter
    const hiddenManualExclusion = item.userState?.lifecycleStatus === 'excluded' && item.userState.exclusionReason !== 'hard_filter_fail'
    return hardFilterMatch && (showExcluded || !hiddenManualExclusion)
  })
}

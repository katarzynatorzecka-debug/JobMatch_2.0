import type { HardFilterResultRecord, OfferLifecycleStatus, OfferUserState } from '../../contracts/workspace'

export function lifecycleForHardFilter(status: HardFilterResultRecord['status']): OfferLifecycleStatus {
  if (status === 'fail') return 'excluded'
  if (status === 'needs_review') return 'needs_review'
  return 'new'
}

export function resolveLifecycle(input: { current: OfferUserState | null; hardFilter: HardFilterResultRecord | null; hasAnalysis: boolean; possibleDuplicate?: boolean }): OfferLifecycleStatus {
  if (input.hardFilter?.status === 'fail' || input.current?.lifecycleStatus === 'excluded') return 'excluded'
  if (input.hasAnalysis) return 'analyzed'
  if (input.hardFilter?.status === 'needs_review' || input.possibleDuplicate) return 'needs_review'
  return 'new'
}

export function fallbackLifecycle(input: { hardFilter: HardFilterResultRecord | null; hasAnalysis: boolean; possibleDuplicate: boolean }): OfferLifecycleStatus {
  if (input.hardFilter?.status === 'fail') return 'excluded'
  if (input.hasAnalysis) return 'analyzed'
  if (input.hardFilter?.status === 'needs_review' || input.possibleDuplicate) return 'needs_review'
  return 'new'
}

import type { ImportedJobOffer } from './import'

export type HardFilterStatus = 'pass' | 'weak' | 'fail'
export type HardFilterReasonCategory = 'contract' | 'work-mode' | 'location' | 'salary' | 'keyword' | 'student-status' | 'must-have' | 'data-quality'

export interface HardFilterReason {
  code: string
  label: string
  category: HardFilterReasonCategory
  profileValue?: string
  offerValue?: string
}

export interface HardFilterResult {
  offerId: string
  status: HardFilterStatus
  reasons: HardFilterReason[]
  missingInformation: string[]
  checkedCriteria: string[]
}

export interface FilteredJobOffer {
  offer: ImportedJobOffer
  result: HardFilterResult
}

export interface HardFilterSession {
  version: 1
  filteredOffers: FilteredJobOffer[]
}

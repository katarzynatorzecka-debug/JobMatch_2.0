import { describe, expect, it } from 'vitest'
import { visibleWorkspaceOffers } from './offerListVisibility'

const hardFilterExcluded = { hardFilter: { status: 'fail' }, userState: { lifecycleStatus: 'excluded', exclusionReason: 'hard_filter_fail' } } as never
const manuallyExcluded = { hardFilter: { status: 'pass' }, userState: { lifecycleStatus: 'excluded', exclusionReason: 'user_decision' } } as never
const active = { hardFilter: { status: 'pass' }, userState: { lifecycleStatus: 'new', exclusionReason: null } } as never

describe('offer list visibility', () => {
  it('keeps active hard-filter failures visible in the default all-offers view', () => {
    expect(visibleWorkspaceOffers([hardFilterExcluded], 'all', false)).toEqual([hardFilterExcluded])
  })

  it('keeps manual exclusions hidden until the user asks to see them', () => {
    expect(visibleWorkspaceOffers([manuallyExcluded, active], 'all', false)).toEqual([active])
    expect(visibleWorkspaceOffers([manuallyExcluded, active], 'all', true)).toEqual([manuallyExcluded, active])
  })

  it('still applies an explicit hard-filter selection', () => {
    expect(visibleWorkspaceOffers([hardFilterExcluded, active], 'pass', false)).toEqual([active])
  })
})

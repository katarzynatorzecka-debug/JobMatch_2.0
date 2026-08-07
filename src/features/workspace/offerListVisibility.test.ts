import { describe, expect, it } from 'vitest'
import { defaultOfferListQuery, listWorkspaceOffers, visibleWorkspaceOffers } from './offerListVisibility'

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

function offerItem(id: string, importedAt: string, score: number | null, overrides: Record<string, unknown> = {}) {
  return {
    offer: { id, sourceType: 'rocketjobs-eml', lastSeenAt: importedAt, firstSeenAt: importedAt, createdAt: importedAt, updatedAt: id === 'older' ? '2026-08-07T10:00:00.000Z' : id === 'newer' ? '2026-08-01T10:00:00.000Z' : importedAt },
    analysis: score === null ? null : { overallScore: score },
    hardFilter: { status: 'pass' },
    userState: { lifecycleStatus: score === null ? 'new' : 'analyzed', exclusionReason: null },
    importSessionIds: ['session-a'],
    ...overrides,
  } as never
}


describe('offer list sorting and combined filters', () => {
  const older = offerItem('older', '2026-08-01T10:00:00.000Z', 40)
  const newer = offerItem('newer', '2026-08-06T10:00:00.000Z', 80)
  const noScore = offerItem('no-score', '2026-08-07T10:00:00.000Z', null)

  it('uses newest-first as the default and supports oldest-first', () => {
    expect(listWorkspaceOffers([older, newer], defaultOfferListQuery, 'newest').map((item) => item.offer.id)).toEqual(['newer', 'older'])
    expect(listWorkspaceOffers([older, newer], defaultOfferListQuery, 'oldest').map((item) => item.offer.id)).toEqual(['older', 'newer'])
  })

  it('sorts by AI score while keeping offers without a score at the end', () => {
    expect(listWorkspaceOffers([noScore, older, newer], defaultOfferListQuery, 'score_desc').map((item) => item.offer.id)).toEqual(['newer', 'older', 'no-score'])
    expect(listWorkspaceOffers([noScore, older, newer], defaultOfferListQuery, 'score_asc').map((item) => item.offer.id)).toEqual(['older', 'newer', 'no-score'])
  })

  it('combines Hard Filter, source and import-session filters with sorting', () => {
    const matching = offerItem('matching', '2026-08-05T10:00:00.000Z', 70, { importSessionIds: ['session-b'], userState: { lifecycleStatus: 'analyzed', exclusionReason: null }, hardFilter: { status: 'needs_review' }, offer: { id: 'matching', sourceType: 'other-source', lastSeenAt: '2026-08-05T10:00:00.000Z', firstSeenAt: '2026-08-05T10:00:00.000Z', createdAt: '2026-08-05T10:00:00.000Z' } })
    const result = listWorkspaceOffers([older, matching, newer], { ...defaultOfferListQuery, hardFilter: 'needs_review', sourceType: 'other-source', importSessionId: 'session-b' }, 'score_desc')
    expect(result.map((item) => item.offer.id)).toEqual(['matching'])
  })

  it('reset state restores newest-first and all offers', () => {
    const filtered = listWorkspaceOffers([older, newer], { ...defaultOfferListQuery, hardFilter: 'fail', sourceType: 'other-source', importSessionId: 'missing', showExcluded: true }, 'score_asc')
    const reset = listWorkspaceOffers([older, newer], defaultOfferListQuery, 'newest')
    expect(filtered).toEqual([])
    expect(reset.map((item) => item.offer.id)).toEqual(['newer', 'older'])
  })
})

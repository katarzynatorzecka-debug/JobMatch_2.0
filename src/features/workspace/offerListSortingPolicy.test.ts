import { describe, expect, it } from 'vitest'
import { defaultOfferListQuery, listWorkspaceOffers } from './offerListVisibility'

function item(id: string, reportDate: string | null, score: number | null) {
  return {
    offer: { id, sourceType: 'rocketjobs-eml', lastSeenAt: '2099-01-01T00:00:00.000Z', firstSeenAt: '2099-01-01T00:00:00.000Z', createdAt: '2099-01-01T00:00:00.000Z' },
    latestImportSessionAt: reportDate,
    isActive: true,
    analysis: score === null ? null : { overallScore: score },
    hardFilter: { status: 'pass' },
    userState: { lifecycleStatus: 'new', exclusionReason: null },
    importSessionIds: ['session-a'],
  } as never
}

describe('canonical report date sorting', () => {
  const older = item('older', '2026-08-01T10:00:00.000Z', 50)
  const newer = item('newer', '2026-08-06T10:00:00.000Z', 50)
  const highest = item('highest', '2026-08-02T10:00:00.000Z', 90)
  const noScore = item('no-score', '2026-08-07T10:00:00.000Z', null)

  it('sorts newest and oldest by canonical report date', () => {
    expect(listWorkspaceOffers([older, newer], defaultOfferListQuery, 'newest').map((entry) => entry.offer.id)).toEqual(['newer', 'older'])
    expect(listWorkspaceOffers([older, newer], defaultOfferListQuery, 'oldest').map((entry) => entry.offer.id)).toEqual(['older', 'newer'])
  })

  it('sorts score descending and ascending with null scores always last', () => {
    expect(listWorkspaceOffers([noScore, older, highest], defaultOfferListQuery, 'score_desc').map((entry) => entry.offer.id)).toEqual(['highest', 'older', 'no-score'])
    expect(listWorkspaceOffers([noScore, older, highest], defaultOfferListQuery, 'score_asc').map((entry) => entry.offer.id)).toEqual(['older', 'highest', 'no-score'])
  })

  it('uses canonical report date and then offer id for score ties', () => {
    const sameDateA = item('offer-a', '2026-08-03T10:00:00.000Z', 50)
    const sameDateB = item('offer-b', '2026-08-03T10:00:00.000Z', 50)
    expect(listWorkspaceOffers([sameDateA, newer, sameDateB], defaultOfferListQuery, 'score_desc').map((entry) => entry.offer.id)).toEqual(['newer', 'offer-b', 'offer-a'])
  })
})
  it('keeps scope, sort and filters serializable for the existing session view state', () => {
    const view = { ...defaultOfferListQuery, scope: 'historical' as const, sort: 'score_desc' as const, hardFilter: 'fail' as const, sourceType: 'other-source', importSessionId: 'session-b', showExcluded: true }
    const restored = JSON.parse(JSON.stringify(view))
    expect(restored).toMatchObject(view)
  })
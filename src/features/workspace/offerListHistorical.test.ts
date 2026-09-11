import { describe, expect, it } from 'vitest'
import { defaultOfferListQuery, listWorkspaceOffers } from './offerListVisibility'

function item(id: string, isActive: boolean, overrides: Record<string, unknown> = {}) {
  return {
    offer: { id, sourceType: 'rocketjobs-eml', lastSeenAt: '2026-08-07T10:00:00.000Z', firstSeenAt: '2026-08-01T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z' },
    isActive,
    hardFilter: { status: 'pass' },
    userState: { lifecycleStatus: 'new', exclusionReason: null },
    importSessionIds: ['session-a'],
    analysis: null,
    ...overrides,
  } as never
}

describe('historical offer visibility', () => {
  const active = item('active-1', true)
  const historical = item('historical-1', false)

  it('keeps the default scope active and excludes historical offers', () => {
    expect(listWorkspaceOffers([active, historical], defaultOfferListQuery, 'newest').map((entry) => entry.offer.id)).toEqual(['active-1'])
  })

  it('shows only historical offers when the user selects the historical scope', () => {
    expect(listWorkspaceOffers([active, historical], { ...defaultOfferListQuery, scope: 'historical' }, 'newest').map((entry) => entry.offer.id)).toEqual(['historical-1'])
  })

  it('keeps existing filters active in the historical scope', () => {
    const matching = item('historical-match', false, { importSessionIds: ['session-b'], offer: { id: 'historical-match', sourceType: 'other-source', lastSeenAt: '2026-08-07T10:00:00.000Z', firstSeenAt: '2026-08-01T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z' }, hardFilter: { status: 'needs_review' } })
    const result = listWorkspaceOffers([historical, matching], { ...defaultOfferListQuery, scope: 'historical', hardFilter: 'needs_review', sourceType: 'other-source', importSessionId: 'session-b' }, 'newest')
    expect(result.map((entry) => entry.offer.id)).toEqual(['historical-match'])
  })

  it('keeps the scope value serializable for the existing session view state', () => {
    const stored = JSON.parse(JSON.stringify({ ...defaultOfferListQuery, scope: 'historical' }))
    expect(stored.scope).toBe('historical')
    expect({ ...defaultOfferListQuery, ...stored }).toMatchObject({ scope: 'historical' })
  })
})
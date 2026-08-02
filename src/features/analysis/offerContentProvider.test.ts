import { describe, expect, it } from 'vitest'
import { OfferContentProvider } from './offerContentProvider'

const offer = { id: 'offer-1', title: 'Data Analyst', company: 'Example', sourceUrl: 'https://rocketjobs.pl/oferta-pracy/example', missingFields: [], warnings: [] }
const source = { offerId: offer.id, sourceUrl: offer.sourceUrl, status: 'completed' as const, sourceQuality: 'full' as const, description: 'Pełna treść oferty.', requirements: ['SQL'], responsibilities: ['Analiza'], benefits: [], missingInformation: [], warnings: [], fetchedAt: '2026-07-31T10:00:00.000Z' }
describe('OfferContentProvider', () => {
  it('uses live normalized source and persists no raw HTML', async () => {
    const saved: unknown[] = []
    const provider = new OfferContentProvider({ fetch: async () => source } as never, { load: async () => null, save: async (entry) => { saved.push(entry) } })
    const result = await provider.find(offer)
    expect(result.sourceQuality).toBe('full')
    expect(result.text).toContain('Wymagania: SQL')
    expect(saved).toEqual([source])
  })

  it('falls back to import data when a fetch fails', async () => {
    const provider = new OfferContentProvider({ fetch: async () => { throw new Error('network') } } as never, { load: async () => null, save: async () => undefined })
    const result = await provider.find(offer)
    expect(result.sourceQuality).toBe('unavailable')
    expect(result.sourceErrorCode).toBe('SOURCE_FETCH_FAILED')
  })
})

import { describe, expect, it } from 'vitest'
import { presentOfferIssues } from './offerIssuePresentation'

describe('offer issue presentation', () => {
  it('shows one fact when missing fields and parser warnings describe the same absence', () => {
    expect(presentOfferIssues({ missingFields: ['wynagrodzenie'], warnings: ['Brak danych: wynagrodzenie.'] })).toEqual({ missing: ['wynagrodzenie'], warnings: [] })
  })

  it('keeps distinct warnings once and removes repeated prefixes', () => {
    expect(presentOfferIssues({ missingFields: ['wynagrodzenie'], warnings: ['Brak danych: lokalizacja.', 'Brak danych: lokalizacja.'] })).toEqual({ missing: ['wynagrodzenie'], warnings: ['lokalizacja'] })
  })
})

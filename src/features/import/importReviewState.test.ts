import { describe, expect, it } from 'vitest'
import type { ImportedJobOffer } from '../../contracts/import'
import { canStartDemoAnalysis, removeImportedOffer, restoreImportedOffers } from './importReviewState'

const offers: ImportedJobOffer[] = [{ id: 'offer-one', title: 'Data Analyst', company: 'Example', missingFields: [], warnings: [] }, { id: 'offer-two', title: 'Automation Specialist', company: 'Northstar', missingFields: [], warnings: [] }]
describe('import review state', () => {
  it('deletes and restores the current imported list', () => { expect(removeImportedOffer(offers, 'offer-one')).toHaveLength(1); expect(restoreImportedOffers(offers)).toEqual(offers) })
  it('allows manual demo analysis only with at least one offer', () => { expect(canStartDemoAnalysis([])).toBe(false); expect(canStartDemoAnalysis(offers)).toBe(true) })
})

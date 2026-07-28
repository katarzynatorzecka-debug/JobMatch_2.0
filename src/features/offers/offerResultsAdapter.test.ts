import { describe, expect, it } from 'vitest'
import type { FilteredJobOffer } from '../../contracts/hardFilter'
import { findFilteredOffer, primaryReason, sortFilteredOffers } from './offerResultsAdapter'

function item(id: string, status: FilteredJobOffer['result']['status']): FilteredJobOffer { return { offer: { id, title: id, company: 'Example', missingFields: [], warnings: [] }, result: { offerId: id, status, reasons: [], missingInformation: [], checkedCriteria: [] } } }
describe('offerResultsAdapter', () => {
  it('sorts PASS, WEAK, FAIL and keeps source order inside a status', () => expect(sortFilteredOffers([item('fail', 'fail'), item('weak-a', 'weak'), item('pass', 'pass'), item('weak-b', 'weak')]).map((value) => value.offer.id)).toEqual(['pass', 'weak-a', 'weak-b', 'fail']))
  it('maps primary reason and finds a selected imported offer', () => { const selected = item('selected', 'pass'); const failed = { ...item('failed', 'fail'), result: { ...item('failed', 'fail').result, reasons: [{ code: 'missing-contract', label: 'Brak umowy.', category: 'contract' as const }, { code: 'excluded-keyword:intern', label: 'Oferta zawiera wykluczone słowo lub frazę.', category: 'keyword' as const }] } }; expect(primaryReason(selected)).toContain('Brak potwierdzonych'); expect(primaryReason(failed)).toContain('wykluczone słowo'); expect(findFilteredOffer([selected], 'selected')).toEqual(selected) })
})

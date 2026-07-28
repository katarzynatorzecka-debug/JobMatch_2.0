import type { FilteredJobOffer, HardFilterStatus } from '../../contracts/hardFilter'

const statusOrder: Record<HardFilterStatus, number> = { pass: 0, weak: 1, fail: 2 }

export function sortFilteredOffers(offers: FilteredJobOffer[]) {
  return offers.map((offer, index) => ({ offer, index })).sort((left, right) => statusOrder[left.offer.result.status] - statusOrder[right.offer.result.status] || left.index - right.index).map(({ offer }) => offer)
}

export function primaryReason(offer: FilteredJobOffer) {
  const confirmedConflict = offer.result.reasons.find((reason) => reason.code === 'excluded-contract' || reason.code === 'excluded-work-mode' || reason.code === 'student-status-required' || reason.code.startsWith('excluded-keyword:'))
  return confirmedConflict?.label ?? offer.result.reasons[0]?.label ?? 'Brak potwierdzonych konfliktów w Hard Filter.'
}

export function offerMeta(offer: FilteredJobOffer) {
  return [offer.offer.location, offer.offer.workMode, offer.offer.contractType, offer.offer.salary].filter((value): value is string => Boolean(value))
}

export function findFilteredOffer(offers: FilteredJobOffer[], id: string | undefined) {
  return offers.find((item) => item.offer.id === id)
}

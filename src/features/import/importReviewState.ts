import type { ImportedJobOffer } from '../../contracts/import'

export function removeImportedOffer(offers: ImportedJobOffer[], id: string) {
  return offers.filter((offer) => offer.id !== id)
}

export function restoreImportedOffers(offers: ImportedJobOffer[]) {
  return offers
}

export function canStartDemoAnalysis(offers: ImportedJobOffer[]) {
  return offers.length > 0
}

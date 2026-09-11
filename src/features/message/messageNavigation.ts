export function messageRouteForOffer(offerId: string) {
  return `/offers/${encodeURIComponent(offerId)}/message`
}
export const offerSourceStatuses = ['pending', 'fetching', 'completed', 'partial', 'unavailable', 'error'] as const
export type OfferSourceStatus = typeof offerSourceStatuses[number]

export const offerSourceQualities = ['full', 'partial', 'unavailable'] as const
export type OfferSourceQuality = typeof offerSourceQualities[number]

export const offerSourceErrorCodes = ['UNSUPPORTED_SOURCE_DOMAIN', 'SOURCE_URL_MISSING', 'SOURCE_FETCH_FAILED', 'SOURCE_TIMEOUT', 'SOURCE_TOO_LARGE', 'SOURCE_EMPTY', 'SOURCE_PARSE_FAILED', 'SOURCE_BLOCKED'] as const
export type OfferSourceErrorCode = typeof offerSourceErrorCodes[number]

export interface OfferPageSource {
  offerId: string
  sourceUrl?: string
}

export interface OfferSourceResult {
  offerId: string
  sourceUrl?: string
  status: OfferSourceStatus
  sourceQuality: OfferSourceQuality
  title?: string
  company?: string
  location?: string
  workMode?: string
  contractType?: string
  salary?: string
  description?: string
  requirements: string[]
  responsibilities: string[]
  benefits: string[]
  missingInformation: string[]
  warnings: string[]
  fetchedAt: string
  errorCode?: OfferSourceErrorCode
}

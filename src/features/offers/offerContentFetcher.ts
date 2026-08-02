import type { ImportedJobOffer } from '../../contracts/import'
import type { OfferSourceErrorCode, OfferSourceResult } from '../../contracts/offerSource'
import { validateOfferSourceResult } from '../../schemas/offerSourceSchemas'
import { supabase } from '../supabase/client'

const rocketJobsHosts = new Set(['rocketjobs.pl', 'www.rocketjobs.pl'])
export function isRocketJobsUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && rocketJobsHosts.has(url.hostname.toLowerCase()) } catch { return false }
}

export class OfferSourceError extends Error { constructor(readonly code: OfferSourceErrorCode) { super(code) } }
function unavailable(offer: ImportedJobOffer, code: OfferSourceErrorCode): OfferSourceResult {
  return { offerId: offer.id, sourceUrl: offer.sourceUrl, status: 'unavailable', sourceQuality: 'unavailable', requirements: [], responsibilities: [], benefits: [], missingInformation: [], warnings: [], fetchedAt: new Date().toISOString(), errorCode: code }
}

export class OfferContentFetcher {
  async fetch(offer: ImportedJobOffer): Promise<OfferSourceResult> {
    if (!offer.sourceUrl) return unavailable(offer, 'SOURCE_URL_MISSING')
    if (!isRocketJobsUrl(offer.sourceUrl)) return unavailable(offer, 'UNSUPPORTED_SOURCE_DOMAIN')
    if (!supabase) throw new OfferSourceError('SOURCE_FETCH_FAILED')
    const { data, error } = await supabase.functions.invoke('fetch-offer-page', { body: { offerId: offer.id, sourceUrl: offer.sourceUrl, offer: { title: offer.title, company: offer.company, location: offer.location, workMode: offer.workMode, contractType: offer.contractType, salary: offer.salary } } })
    if (error) {
      const response = (error as { context?: Response }).context
      const body = response ? await response.json().catch(() => null) as { code?: OfferSourceErrorCode } | null : null
      throw new OfferSourceError(body?.code ?? 'SOURCE_FETCH_FAILED')
    }
    const parsed = validateOfferSourceResult(data)
    if (!parsed.success) throw new OfferSourceError('SOURCE_PARSE_FAILED')
    return parsed.data
  }
}

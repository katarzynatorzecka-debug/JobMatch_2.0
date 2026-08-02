import type { ImportedJobOffer } from '../../contracts/import'
import type { OfferContent } from '../../contracts/jobAnalysis'
import type { OfferSourceErrorCode, OfferSourceResult } from '../../contracts/offerSource'
import { OfferContentFetcher, OfferSourceError } from '../offers/offerContentFetcher'
import type { OfferSourceRepository } from '../offers/offerSourceRepository'

function contentText(source: OfferSourceResult) {
  return [source.description, source.requirements.length ? `Wymagania: ${source.requirements.join('; ')}` : '', source.responsibilities.length ? `Zakres obowiązków: ${source.responsibilities.join('; ')}` : '', source.benefits.length ? `Benefity: ${source.benefits.join('; ')}` : ''].filter(Boolean).join('\n').slice(0, 18_000)
}

function fallback(offer: ImportedJobOffer, code: OfferSourceErrorCode, cached: OfferSourceResult | null): OfferContent {
  if (cached && cached.sourceQuality !== 'unavailable') return { text: contentText(cached), sourceQuality: cached.sourceQuality, source: cached, sourceErrorCode: code }
  const source: OfferSourceResult = { offerId: offer.id, sourceUrl: offer.sourceUrl, status: 'unavailable', sourceQuality: 'unavailable', requirements: [], responsibilities: [], benefits: [], missingInformation: ['pełna treść oferty'], warnings: [], fetchedAt: new Date().toISOString(), errorCode: code }
  return { text: '', sourceQuality: 'unavailable', source, sourceErrorCode: code }
}

export class OfferContentProvider {
  constructor(private readonly fetcher: OfferContentFetcher, private readonly repository: OfferSourceRepository) {}

  async find(offer: ImportedJobOffer): Promise<OfferContent> {
    const cached = await this.repository.load(offer.id)
    try {
      const source = await this.fetcher.fetch(offer)
      await this.repository.save(source)
      return { text: contentText(source), sourceQuality: source.sourceQuality, source, sourceErrorCode: source.errorCode }
    } catch (error) {
      const code = error instanceof OfferSourceError ? error.code : 'SOURCE_FETCH_FAILED'
      const result = fallback(offer, code, cached)
      await this.repository.save(result.source).catch(() => undefined)
      return result
    }
  }
}

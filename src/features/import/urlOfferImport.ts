import type { ImportedJobOffer, ImportedReport } from '../../contracts/import'
import type { OfferSourceResult } from '../../contracts/offerSource'

export function normalizeOfferUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function stableUrlId(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `url-${(hash >>> 0).toString(36)}`
}

export function createUrlOfferSeed(sourceUrl: string): ImportedJobOffer {
  return { id: stableUrlId(sourceUrl), title: 'Oferta z linku', company: new URL(sourceUrl).hostname, sourceUrl, missingFields: [], warnings: [] }
}

export function importedReportFromUrlSource(source: OfferSourceResult, requestedUrl: string): ImportedReport {
  const sourceUrl = source.sourceUrl || requestedUrl
  const fallbackCompany = new URL(sourceUrl).hostname
  const offer: ImportedJobOffer = {
    id: source.offerId,
    title: source.title?.trim() || 'Oferta z linku',
    company: source.company?.trim() || fallbackCompany,
    location: source.location,
    workMode: source.workMode,
    contractType: source.contractType,
    salary: source.salary,
    sourceUrl,
    sourceLabel: 'Oferta z linku',
    missingFields: source.missingInformation,
    warnings: source.warnings,
  }
  return { version: 1, source: 'job-url', fileName: sourceUrl, importedAt: new Date().toISOString(), offers: [offer], warnings: source.warnings.map((message) => ({ code: 'partial-parse' as const, message })) }
}

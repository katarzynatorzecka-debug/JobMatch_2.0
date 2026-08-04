import type { DedupCandidate, DedupDecision } from '../../contracts/workspace'

const trackingParameter = /^(?:utm_[^=]+|gclid|fbclid|mc_cid|mc_eid)$/i

function normalizedPart(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function normalizeSourceUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null

  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameter.test(key)) url.searchParams.delete(key)
    }
    url.searchParams.sort()
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return null
  }
}

export function buildCanonicalFingerprint(input: { sourceType: string; company: string; title: string; location: string | null | undefined }): string | null {
  const parts = [input.sourceType, input.company, input.title, input.location ?? ''].map(normalizedPart)
  return parts.every(Boolean) ? parts.join('|') : null
}

export function classifyDedupMatch(input: { normalizedSourceUrl: string | null; canonicalFingerprint: string | null; candidates: DedupCandidate[] }): DedupDecision {
  const exactUrl = input.normalizedSourceUrl
    ? input.candidates.filter((candidate) => candidate.normalizedSourceUrl === input.normalizedSourceUrl)
    : []

  if (exactUrl.length === 1) {
    return { matchType: 'exact_url', targetOfferId: exactUrl[0].id, candidateOfferIds: [exactUrl[0].id], isNew: false, isDuplicate: true, needsReview: false }
  }

  const canonical = input.canonicalFingerprint
    ? input.candidates.filter((candidate) => candidate.canonicalFingerprint === input.canonicalFingerprint && (!input.normalizedSourceUrl || !candidate.normalizedSourceUrl || candidate.normalizedSourceUrl === input.normalizedSourceUrl))
    : []

  if (canonical.length === 1) {
    return { matchType: 'canonical_high_confidence', targetOfferId: canonical[0].id, candidateOfferIds: [canonical[0].id], isNew: false, isDuplicate: true, needsReview: false }
  }

  const ambiguous = exactUrl.length > 1 ? exactUrl : canonical
  if (ambiguous.length > 0) {
    return { matchType: 'possible_duplicate', targetOfferId: null, candidateOfferIds: ambiguous.map((candidate) => candidate.id), isNew: true, isDuplicate: false, needsReview: true }
  }

  return { matchType: 'new', targetOfferId: null, candidateOfferIds: [], isNew: true, isDuplicate: false, needsReview: false }
}

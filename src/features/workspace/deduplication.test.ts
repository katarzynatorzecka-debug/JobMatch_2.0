import { describe, expect, it } from 'vitest'
import { buildCanonicalFingerprint, classifyDedupMatch, normalizeSourceUrl } from './deduplication'

describe('workspace deduplication helpers', () => {
  it('normalizes source URLs without losing identifying query parameters', () => {
    expect(normalizeSourceUrl('HTTPS://Jobs.Example.com:443/role/?utm_source=newsletter&job=42#details')).toBe('https://jobs.example.com/role?job=42')
    expect(normalizeSourceUrl('https://jobs.example.com/role?job=42&gclid=tracking&utm_medium=email')).toBe('https://jobs.example.com/role?job=42')
    expect(normalizeSourceUrl('https://JOBS.example.com/role/?b=2&a=1')).toBe('https://jobs.example.com/role?a=1&b=2')
    expect(normalizeSourceUrl('mailto:jobs@example.com')).toBeNull()
  })

  it('reuses a single exact normalized URL match', () => {
    const decision = classifyDedupMatch({
      normalizedSourceUrl: 'https://jobs.example.com/role/42',
      canonicalFingerprint: 'rocketjobs|acme|data analyst|warszawa',
      candidates: [{ id: 'offer-a', normalizedSourceUrl: 'https://jobs.example.com/role/42', canonicalFingerprint: null }],
    })
    expect(decision).toMatchObject({ matchType: 'exact_url', targetOfferId: 'offer-a', isDuplicate: true, needsReview: false })
  })

  it('reuses one deterministic canonical candidate only when URLs do not conflict', () => {
    const fingerprint = buildCanonicalFingerprint({ sourceType: 'rocketjobs', company: 'Acme', title: 'Data Analyst', location: 'Warszawa' })
    const decision = classifyDedupMatch({ normalizedSourceUrl: null, canonicalFingerprint: fingerprint, candidates: [{ id: 'offer-a', normalizedSourceUrl: null, canonicalFingerprint: fingerprint }] })
    expect(decision).toMatchObject({ matchType: 'canonical_high_confidence', targetOfferId: 'offer-a', isDuplicate: true })
  })

  it('keeps ambiguous candidates as a separate possible duplicate', () => {
    const fingerprint = buildCanonicalFingerprint({ sourceType: 'rocketjobs', company: 'Acme', title: 'Data Analyst', location: 'Warszawa' })
    const decision = classifyDedupMatch({
      normalizedSourceUrl: null,
      canonicalFingerprint: fingerprint,
      candidates: [
        { id: 'offer-a', normalizedSourceUrl: null, canonicalFingerprint: fingerprint },
        { id: 'offer-b', normalizedSourceUrl: null, canonicalFingerprint: fingerprint },
      ],
    })
    expect(decision).toMatchObject({ matchType: 'possible_duplicate', targetOfferId: null, isNew: true, isDuplicate: false, needsReview: true })
    expect(decision.candidateOfferIds).toEqual(['offer-a', 'offer-b'])
  })

  it('never reuses a canonical candidate when two non-empty source URLs conflict', () => {
    const fingerprint = buildCanonicalFingerprint({ sourceType: 'rocketjobs', company: 'Acme', title: 'Data Analyst', location: 'Warszawa' })
    const decision = classifyDedupMatch({
      normalizedSourceUrl: 'https://jobs.example.com/role/42',
      canonicalFingerprint: fingerprint,
      candidates: [{ id: 'offer-a', normalizedSourceUrl: 'https://jobs.example.com/role/99', canonicalFingerprint: fingerprint }],
    })
    expect(decision).toMatchObject({ matchType: 'new', targetOfferId: null, isNew: true, isDuplicate: false })
  })

  it('marks multiple exact URL candidates as possible duplicates instead of reusing either one', () => {
    const normalizedSourceUrl = 'https://jobs.example.com/role/42'
    const decision = classifyDedupMatch({
      normalizedSourceUrl,
      canonicalFingerprint: null,
      candidates: [
        { id: 'offer-a', normalizedSourceUrl, canonicalFingerprint: null },
        { id: 'offer-b', normalizedSourceUrl, canonicalFingerprint: null },
      ],
    })
    expect(decision).toMatchObject({ matchType: 'possible_duplicate', targetOfferId: null, needsReview: true })
  })

  it('does not construct a canonical fingerprint from incomplete identity fields', () => {
    expect(buildCanonicalFingerprint({ sourceType: 'rocketjobs', company: 'Acme', title: 'Data Analyst', location: '' })).toBeNull()
  })
})

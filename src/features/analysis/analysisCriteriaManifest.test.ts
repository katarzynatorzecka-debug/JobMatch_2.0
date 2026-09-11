import { describe, expect, it } from 'vitest'
import { buildDeterministicOfferManifest, canonicalSourceHashInput, isAnalysisCriteriaManifest, isManifestSufficientForAnalysis, manifestFromAnalysis, outputMatchesManifest } from '../../../supabase/functions/_shared/analysisCriteriaManifest'
import type { AnalysisOutput } from '../../../supabase/functions/_shared/jobAnalysisOutputSchema'

const criteria = Object.fromEntries(['experience', 'skills', 'preferences', 'growth'].map((category) => [category, [{ id: `req:${category}`, canonicalKey: `req:${category}`, requirement: `Wymóg ${category}`, outcome: 'MATCH' as const, rationale: 'Dowód.', profileEvidence: ['Profil'], offerEvidence: ['Oferta'], confidence: 80 }]])) as AnalysisOutput['criteria']
const sourceHash = 'a'.repeat(64)

describe('analysis criteria manifest', () => {
  it('persists the offer requirement contract without profile outcomes', () => {
    const manifest = manifestFromAnalysis(criteria, sourceHash)
    expect(isAnalysisCriteriaManifest(manifest)).toBe(true)
    expect(manifest.criteria.skills[0]).toEqual({ id: 'req:skills', canonicalKey: 'req:skills', requirement: 'Wymóg skills' })
  })

  it('rejects changing an offer requirement during a later profile analysis', () => {
    const manifest = manifestFromAnalysis(criteria, sourceHash)
    expect(outputMatchesManifest(criteria, manifest)).toBe(true)
    expect(outputMatchesManifest({ ...criteria, skills: [{ ...criteria.skills[0], canonicalKey: 'req:other' }] }, manifest)).toBe(false)
  })

  it('builds the initial requirement list deterministically before any AI classification', () => {
    const offer = { title: 'Automation Specialist', location: 'Remote', contractType: 'B2B' }
    const snapshot = { text: 'Treść oferty', requirements: ['3 lata doświadczenia w automatyzacji', 'Znajomość Looker Studio', 'Praca zdalna, B2B'], responsibilities: ['Rozwój automatyzacji'], benefits: [] }
    const first = buildDeterministicOfferManifest(offer, snapshot, sourceHash)
    const second = buildDeterministicOfferManifest(offer, snapshot, sourceHash)
    expect(first).toEqual(second)
    expect(first.criteria.experience.map((item) => item.canonicalKey)).toContain('req:experience-3-lata-doswiadczenia-w-automatyzacji')
    expect(first.criteria.skills.map((item) => item.canonicalKey)).toContain('req:skills-znajomosc-looker-studio')
    expect(first.criteria.preferences.map((item) => item.canonicalKey)).toContain('req:preferences-praca-zdalna-b2b')
    expect(isAnalysisCriteriaManifest(first)).toBe(true)
    expect(first.sourceSnapshotHash).toBe(sourceHash)
    expect(first.quality.sourceCriterionCount).toBeGreaterThan(0)
    expect(isManifestSufficientForAnalysis(first)).toBe(true)
  })

  it('uses explicit requirements from full text and never creates generic baseline criteria', () => {
    const manifest = buildDeterministicOfferManifest({ title: 'Community Moderator', workMode: 'Remote' }, { text: 'You have experience moderating social media. You are fluent in Arabic.', requirements: [], responsibilities: [] }, sourceHash)
    const requirements = Object.values(manifest.criteria).flat().map((item) => item.requirement)
    expect(requirements).toContain('You have experience moderating social media.')
    expect(requirements).toContain('You are fluent in Arabic.')
    expect(requirements.some((value) => /Adekwatne doświadczenie|Kompetencje wymagane|Warunki pracy|potencjał rozwoju/.test(value))).toBe(false)
    expect(isManifestSufficientForAnalysis(manifest)).toBe(true)
  })

  it('deduplicates the same explicit requirement from section and full text', () => {
    const requirement = 'You have 5 years of experience in operations.'
    const manifest = buildDeterministicOfferManifest({ title: 'Operations Lead' }, { text: requirement, requirements: [requirement], responsibilities: [] }, sourceHash)
    expect(Object.values(manifest.criteria).flat().filter((item) => item.requirement === requirement)).toHaveLength(1)
  })

  it('blocks a metadata-only rubric from analysis', () => {
    const manifest = buildDeterministicOfferManifest({ title: 'Unknown role', location: 'Remote' }, { text: 'General company introduction.', requirements: [], responsibilities: [] }, sourceHash)
    expect(manifest.quality.metadataCriterionCount).toBe(2)
    expect(manifest.quality.sourceCriterionCount).toBe(0)
    expect(isManifestSufficientForAnalysis(manifest)).toBe(false)
  })

  it('fails closed instead of silently dropping an oversized explicit rubric', () => {
    const requirements = Array.from({ length: 33 }, (_, index) => `Required platform skill ${index + 1}`)
    const manifest = buildDeterministicOfferManifest({ title: 'Platform Specialist' }, { text: '', requirements, responsibilities: [] }, sourceHash)
    expect(manifest.criteria.skills).toHaveLength(32)
    expect(manifest.quality.omittedCriterionCount).toBe(1)
    expect(isManifestSufficientForAnalysis(manifest)).toBe(false)
  })

  it('canonicalizes source content independently of whitespace and duplicate entries', () => {
    const first = canonicalSourceHashInput({ sourceQuality: 'full', text: 'One   requirement', requirements: ['English', 'English'], responsibilities: ['Build workflows'], missingInformation: [] })
    const second = canonicalSourceHashInput({ sourceQuality: 'full', text: 'One requirement', requirements: ['English'], responsibilities: ['Build   workflows'], benefits: [], missingInformation: [] })
    expect(first).toBe(second)
  })
})

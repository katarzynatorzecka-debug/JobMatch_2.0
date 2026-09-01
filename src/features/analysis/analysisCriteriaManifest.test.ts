import { describe, expect, it } from 'vitest'
import { buildDeterministicOfferManifest, isAnalysisCriteriaManifest, manifestFromAnalysis, outputMatchesManifest } from '../../../supabase/functions/_shared/analysisCriteriaManifest'
import type { AnalysisOutput } from '../../../supabase/functions/_shared/jobAnalysisOutputSchema'

const criteria = Object.fromEntries(['experience', 'skills', 'preferences', 'growth'].map((category) => [category, [{ id: `req:${category}`, canonicalKey: `req:${category}`, requirement: `Wymóg ${category}`, outcome: 'MATCH' as const, rationale: 'Dowód.', profileEvidence: ['Profil'], offerEvidence: ['Oferta'], confidence: 80 }]])) as AnalysisOutput['criteria']

describe('analysis criteria manifest', () => {
  it('persists the offer requirement contract without profile outcomes', () => {
    const manifest = manifestFromAnalysis(criteria)
    expect(isAnalysisCriteriaManifest(manifest)).toBe(true)
    expect(manifest.criteria.skills[0]).toEqual({ id: 'req:skills', canonicalKey: 'req:skills', requirement: 'Wymóg skills' })
  })

  it('rejects changing an offer requirement during a later profile analysis', () => {
    const manifest = manifestFromAnalysis(criteria)
    expect(outputMatchesManifest(criteria, manifest)).toBe(true)
    expect(outputMatchesManifest({ ...criteria, skills: [{ ...criteria.skills[0], canonicalKey: 'req:other' }] }, manifest)).toBe(false)
  })

  it('builds the initial requirement list deterministically before any AI classification', () => {
    const offer = { title: 'Automation Specialist' }
    const snapshot = { text: 'Treść oferty', requirements: ['3 lata doświadczenia w automatyzacji', 'Znajomość Looker Studio', 'Praca zdalna, B2B'], responsibilities: ['Rozwój automatyzacji'], benefits: [] }
    const first = buildDeterministicOfferManifest(offer, snapshot)
    const second = buildDeterministicOfferManifest(offer, snapshot)
    expect(first).toEqual(second)
    expect(first.criteria.experience.map((item) => item.canonicalKey)).toContain('req:experience-3-lata-doswiadczenia-w-automatyzacji')
    expect(first.criteria.skills.map((item) => item.canonicalKey)).toContain('req:skills-znajomosc-looker-studio')
    expect(first.criteria.preferences.map((item) => item.canonicalKey)).toContain('req:preferences-praca-zdalna-b2b')
    expect(isAnalysisCriteriaManifest(first)).toBe(true)
  })
})

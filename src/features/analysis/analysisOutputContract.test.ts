import { describe, expect, it } from 'vitest'
import { isAnalysisOutput } from '../../../supabase/functions/_shared/jobAnalysisOutputSchema'
import edgeSource from '../../../supabase/functions/analyze-job-match/index.ts?raw'
import { DETERMINISTIC_SCORING_VERSION } from './deterministicScoring'
import { CURRENT_ANALYSIS_ALGORITHM_VERSION } from '../workspace/analysisQueue'

const criteria = Object.fromEntries(['experience', 'skills', 'preferences', 'growth'].map((category) => [category, [{ id: `req:${category}-criterion`, canonicalKey: `req:${category}-criterion`, requirement: `Wymóg ${category}.`, outcome: 'MATCH', rationale: 'Potwierdzone konkretnymi danymi.', profileEvidence: ['Dane profilu.'], offerEvidence: ['Dane oferty.'], confidence: 80 }]]))

describe('AI criterion output contract', () => {
  it('accepts only criterion outcomes rather than an AI-generated final score', () => {
    expect(isAnalysisOutput({ criteria, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(true)
  })

  it('rejects a missing criterion and an unsupported outcome', () => {
    expect(isAnalysisOutput({ criteria: { ...criteria, growth: undefined }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
    expect(isAnalysisOutput({ criteria: { ...criteria, skills: [{ ...criteria.skills[0], outcome: 'MAYBE' }] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
  })

  it('requires req identifiers and rejects the same atomic requirement in two categories', () => {
    expect(isAnalysisOutput({ criteria: { ...criteria, skills: [{ ...criteria.skills[0], id: criteria.experience[0].id }] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
    expect(isAnalysisOutput({ criteria: { ...criteria, skills: [{ ...criteria.skills[0], id: 'skill' }] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
  })

  it('requires the stable canonical requirement key for new Edge output', () => {
    expect(isAnalysisOutput({ criteria: { ...criteria, skills: [{ ...criteria.skills[0], canonicalKey: 'invalid' }] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
    expect(isAnalysisOutput({ criteria: { ...criteria, skills: [{ ...criteria.skills[0], id: 'req:different-id', canonicalKey: criteria.experience[0].canonicalKey }] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
  })

  it('rejects a MATCH without both evidence sides in the Edge completion guard', () => {
    expect(edgeSource).toContain("criterion.outcome === 'MATCH' && (!criterion.profileEvidence.length || !criterion.offerEvidence.length)")
    expect(edgeSource).toContain("OPENAI_EVIDENCE_MISSING")
  })

  it('keeps frontend, Edge and persisted freshness on the same deterministic algorithm version', () => {
    expect(DETERMINISTIC_SCORING_VERSION).toBe(CURRENT_ANALYSIS_ALGORITHM_VERSION)
    expect(edgeSource).toContain(`const algorithmVersion = '${DETERMINISTIC_SCORING_VERSION}'`)
    expect(edgeSource).toContain('algorithm_version: algorithmVersion')
  })

  it('passes fetched public offer text to the structured analysis prompt and keeps partial fallback explicit', () => {
    expect(edgeSource).toContain('/functions/v1/fetch-offer-page')
    expect(edgeSource).toContain('Trwały snapshot publicznej treści oferty')
    expect(edgeSource).toContain('analysis_source_snapshot')
    expect(edgeSource).toContain('OPENAI_CRITERIA_MANIFEST_MISMATCH')
    expect(edgeSource).toContain("sourceQuality: 'partial'")
  })

  it('keeps a manually overridden Hard Filter FAIL visible and non-recommendable', () => {
    expect(edgeSource).toContain("hardFilter.status === 'fail' ? 'fail' : 'pass'")
    expect(edgeSource).toContain("analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję'")
  })
})

import { describe, expect, it } from 'vitest'
import { buildCandidateAssessmentPrompt, candidateAssessmentToAnalysisOutput, candidateAssessmentJsonSchema, candidateAssessmentValidationDiagnostic, isCandidateAssessmentOutput, type CandidateAssessmentOutput } from './candidateAssessment'
import type { OfferIntelligenceRubric } from './offerIntelligence'

const rubric: OfferIntelligenceRubric = {
  contractVersion: 'jobmatch-offer-intelligence-r1',
  sourceSnapshotHash: 'c'.repeat(64),
  quality: { sourceCompleteness: 'full', rubricCompleteness: 'complete', criterionCount: 3, unresolvedAmbiguityCount: 0, missingInformation: [] },
  criteria: [
    { id: 'req:arabic-language', canonicalKey: 'req:arabic-language', statement: 'Znajomość języka arabskiego', type: 'language', importance: 'critical', category: 'skills', sourceEvidence: ['arabski'], sourceSection: 'requirements', requiredExplicitly: true },
    { id: 'req:social-media-moderation', canonicalKey: 'req:social-media-moderation', statement: 'Doświadczenie w moderacji social media', type: 'required_experience', importance: 'core', category: 'experience', sourceEvidence: ['moderating social media'], sourceSection: 'description', requiredExplicitly: true },
    { id: 'req:remote-work', canonicalKey: 'req:remote-work', statement: 'Praca zdalna', type: 'employment_condition', importance: 'preferred', category: 'preferences', sourceEvidence: ['remote'], sourceSection: 'description', requiredExplicitly: true },
  ],
}

function assessment(overrides: Partial<CandidateAssessmentOutput['criteria']['skills'][number]> = {}): CandidateAssessmentOutput['criteria']['skills'][number] {
  return { id: 'req:arabic-language', canonicalKey: 'req:arabic-language', requirement: 'Znajomość języka arabskiego', type: 'language', importance: 'critical', outcome: 'NO_MATCH', rationale: 'Profil nie zawiera potwierdzenia.', profileEvidence: [], confidence: 90, ...overrides }
}

function output(overrides: Partial<CandidateAssessmentOutput['criteria']['skills'][number]> = {}): CandidateAssessmentOutput {
  return { criteria: { experience: [{ id: 'req:social-media-moderation', canonicalKey: 'req:social-media-moderation', requirement: 'Doświadczenie w moderacji social media', type: 'required_experience', importance: 'core', outcome: 'PARTIAL', rationale: 'Profil pokazuje częściowo transferowalne doświadczenie.', profileEvidence: ['Moderacja społeczności w projekcie.'], confidence: 70 }], skills: [assessment(overrides)], preferences: [{ id: 'req:remote-work', canonicalKey: 'req:remote-work', requirement: 'Praca zdalna', type: 'employment_condition', importance: 'preferred', outcome: 'MATCH', rationale: 'Profil potwierdza pracę zdalną.', profileEvidence: ['Praca zdalna.'], confidence: 95 }], growth: [] }, summary: 'Ocena względem pełnej rubryki.', strengths: ['Doświadczenie transferowalne.'], risks: ['Brak potwierdzenia języka.'], missingInformation: [] }
}

describe('candidate assessment contract', () => {
  it('requires every rubric criterion exactly once and preserves immutable fields', () => {
    const value = output()
    expect(isCandidateAssessmentOutput(value, rubric)).toBe(true)
    const analysis = candidateAssessmentToAnalysisOutput(value, rubric)
    expect(analysis.criteria.skills[0]).toMatchObject({ type: 'language', importance: 'critical' })
    expect(analysis.criteria.skills[0].offerEvidence).toEqual(['arabski'])
    expect(analysis.criteria.experience[0].offerEvidence).toEqual(['moderating social media'])
  })

  it('rejects UNKNOWN for a complete rubric and rejects positive outcomes without profile evidence', () => {
    expect(isCandidateAssessmentOutput(output({ outcome: 'UNKNOWN' }), rubric)).toBe(false)
    expect(isCandidateAssessmentOutput(output({ outcome: 'MATCH', profileEvidence: [] }), rubric)).toBe(false)
  })

  it('rejects changing type, importance, requirement or criterion count', () => {
    expect(isCandidateAssessmentOutput(output({ importance: 'preferred' }), rubric)).toBe(false)
    expect(isCandidateAssessmentOutput(output({ requirement: 'Inny wymóg' }), rubric)).toBe(false)
    const missing = output()
    missing.criteria.experience = []
    expect(isCandidateAssessmentOutput(missing, rubric)).toBe(false)
  })

  it('reports only an aggregate diagnostic for invalid provider output', () => {
    const missing = output()
    missing.criteria.experience = []
    expect(candidateAssessmentValidationDiagnostic(missing, rubric)).toBe('experience_count_0_expected_1')
  })

  it('uses the full rubric and bounded candidate context in the assessment prompt', () => {
    const prompt = buildCandidateAssessmentPrompt(rubric, { skills: ['moderation'] }, { status: 'pass' })
    expect(prompt).toContain('req:arabic-language')
    expect(prompt).toContain('moderation')
    expect(prompt).toContain('experience=1, skills=1, preferences=1, growth=0')
    expect(prompt).toContain('Nie twórz żadnych dodatkowych kryteriów')
    expect(prompt).toContain('Jasne wymaganie bez dowodu w profilu oznacza NO_MATCH')
    expect(candidateAssessmentJsonSchema.properties.criteria).toBeDefined()
  })
})

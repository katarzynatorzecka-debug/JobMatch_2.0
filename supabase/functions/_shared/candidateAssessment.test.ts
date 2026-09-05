import { describe, expect, it } from 'vitest'
import { manifestFromOfferIntelligenceRubric, outputMatchesManifest } from './analysisCriteriaManifest'
import { buildCandidateAssessmentPrompt, buildCandidateAssessmentRecoveryPrompt, candidateAssessmentToAnalysisOutput, candidateAssessmentJsonSchema, candidateAssessmentJsonSchemaForRubric, candidateAssessmentValidationDiagnostic, isCandidateAssessmentOutput, type CandidateAssessmentOutput } from './candidateAssessment'
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
  return { id: 'req:arabic-language', matchType: 'no_evidence', outcome: 'NO_MATCH', rationale: { pl: 'Profil nie zawiera potwierdzenia.', en: 'The profile contains no supporting evidence.' }, profileEvidence: [], confidence: 90, ...overrides }
}

function output(overrides: Partial<CandidateAssessmentOutput['criteria']['skills'][number]> = {}): CandidateAssessmentOutput {
  return { criteria: { experience: [{ id: 'req:social-media-moderation', matchType: 'transferable', outcome: 'PARTIAL', rationale: { pl: 'Profil pokazuje częściowo transferowalne doświadczenie.', en: 'The profile shows partially transferable experience.' }, profileEvidence: ['Moderacja społeczności w projekcie.'], confidence: 70 }], skills: [assessment(overrides)], preferences: [{ id: 'req:remote-work', matchType: 'direct', outcome: 'MATCH', rationale: { pl: 'Profil potwierdza pracę zdalną.', en: 'The profile confirms remote work.' }, profileEvidence: ['Praca zdalna.'], confidence: 95 }], growth: [] }, localizedContent: { pl: { summary: 'Ocena względem pełnej rubryki.', strengths: ['Doświadczenie transferowalne.'], risks: ['Brak potwierdzenia języka.'], missingInformation: [] }, en: { summary: 'Assessment against the complete rubric.', strengths: ['Transferable experience.'], risks: ['No language evidence.'], missingInformation: [] } } }
}

describe('candidate assessment contract', () => {
  it('requires every rubric criterion exactly once and preserves immutable fields', () => {
    const value = output()
    expect(isCandidateAssessmentOutput(value, rubric)).toBe(true)
    const analysis = candidateAssessmentToAnalysisOutput(value, rubric)
    expect(analysis.criteria.skills[0]).toMatchObject({ type: 'language', importance: 'critical', matchType: 'no_evidence', outcome: 'UNKNOWN' })
    expect(analysis.criteria.skills[0].offerEvidence).toEqual(['arabski'])
    expect(analysis.criteria.experience[0].offerEvidence).toEqual(['moderating social media'])
    expect(analysis.criteria.experience[0].localizedRationale?.en).toBe('The profile shows partially transferable experience.')
    expect(analysis.localizedContent?.en.summary).toBe('Assessment against the complete rubric.')
    expect(outputMatchesManifest(analysis.criteria, manifestFromOfferIntelligenceRubric(rubric))).toBe(true)
  })

  it('rejects UNKNOWN for a complete rubric and rejects positive outcomes without profile evidence', () => {
    expect(isCandidateAssessmentOutput(output({ outcome: 'UNKNOWN' }), rubric)).toBe(false)
    expect(isCandidateAssessmentOutput(output({ outcome: 'MATCH', profileEvidence: [] }), rubric)).toBe(false)
  })

  it('maps transferable evidence to PARTIAL and keeps contradiction distinct from no evidence', () => {
    const transferable = output({ outcome: 'PARTIAL', matchType: 'transferable', profileEvidence: ['BEN10: grywalne MVP webowe.'] })
    expect(isCandidateAssessmentOutput(transferable, rubric)).toBe(true)
    expect(candidateAssessmentToAnalysisOutput(transferable, rubric).criteria.skills[0]?.outcome).toBe('PARTIAL')
    const contradiction = output({ outcome: 'NO_MATCH', matchType: 'contradiction', rationale: { pl: 'Profil wprost wskazuje wyłącznie pracę stacjonarną.', en: 'The profile explicitly states onsite-only work.' } })
    expect(isCandidateAssessmentOutput(contradiction, rubric)).toBe(true)
    expect(candidateAssessmentToAnalysisOutput(contradiction, rubric).criteria.skills[0]?.outcome).toBe('NO_MATCH')
  })

  it('rejects an unknown criterion id or criterion count', () => {
    expect(isCandidateAssessmentOutput(output({ id: 'req:unknown' }), rubric)).toBe(false)
    const missing = output()
    missing.criteria.experience = []
    expect(isCandidateAssessmentOutput(missing, rubric)).toBe(false)
  })

  it('ignores provider attempts to paraphrase rubric text because the provider no longer owns immutable fields', () => {
    const value = output()
    const withLegacyFields = value as unknown as { criteria: { skills: Array<Record<string, unknown>> } }
    withLegacyFields.criteria.skills[0].requirement = 'Inny wymóg'
    expect(isCandidateAssessmentOutput(value, rubric)).toBe(false)
    delete withLegacyFields.criteria.skills[0].requirement
    expect(isCandidateAssessmentOutput(value, rubric)).toBe(true)
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
    expect(prompt).toContain('localizedContent.pl i localizedContent.en')
    expect(prompt).toContain('Nie tłumacz nazw firm')
    expect(candidateAssessmentJsonSchema.properties.criteria).toBeDefined()
  })

  it('provides a strict recovery prompt for a manifest mismatch', () => {
    const prompt = buildCandidateAssessmentRecoveryPrompt(rubric, { skills: ['moderation'] }, { status: 'pass' })
    expect(prompt).toContain('RECOVERY')
    expect(prompt).toContain('dokładnie tę samą liczbę, kolejność i wartości id')
  })

  it('binds the provider schema to the exact rubric count for every category', () => {
    const schema = candidateAssessmentJsonSchemaForRubric(rubric) as { properties: { criteria: { properties: Record<string, { minItems?: number; maxItems?: number }> } } }
    expect(schema.properties.criteria.properties.experience).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(schema.properties.criteria.properties.skills).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(schema.properties.criteria.properties.preferences).toMatchObject({ minItems: 1, maxItems: 1 })
    expect(schema.properties.criteria.properties.growth).toMatchObject({ minItems: 0, maxItems: 0 })
  })

  it('binds immutable criterion values to the rubric in the provider schema', () => {
    const schema = candidateAssessmentJsonSchemaForRubric(rubric) as { properties: { criteria: { properties: Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }> } } }
    expect(schema.properties.criteria.properties.skills.items?.properties?.id).toMatchObject({ enum: ['req:arabic-language'] })
    expect(schema.properties.criteria.properties.skills.items?.properties?.requirement).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { isAnalysisOutput } from '../../../supabase/functions/_shared/jobAnalysisOutputSchema'
import edgeSource from '../../../supabase/functions/analyze-job-match/index.ts?raw'
import candidateAssessmentSource from '../../../supabase/functions/_shared/candidateAssessment.ts?raw'
import scoringSource from '../../../supabase/functions/_shared/scoringCalibration.ts?raw'
import { DETERMINISTIC_SCORING_VERSION } from './deterministicScoring'
import { CURRENT_ANALYSIS_ALGORITHM_VERSION, CURRENT_ANALYSIS_PROMPT_VERSION } from '../workspace/analysisQueue'

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

  it('separates a clear unsupported requirement from UNKNOWN and guards criterion evidence', () => {
    expect(edgeSource).toContain('buildCandidateAssessmentPrompt(rubric, candidateContext, hardFilter)')
    expect(edgeSource).toContain('isCandidateAssessmentOutput(parsedAssessment.value, rubric)')
    expect(candidateAssessmentSource).toContain("criterion.matchType === 'direct' || criterion.matchType === 'transferable'")
    expect(candidateAssessmentSource).toContain('profileEvidence.length > 0')
    expect(candidateAssessmentSource).toContain('sourceEvidence')
    expect(candidateAssessmentSource).not.toContain('profileEvidenceCeiling')
  })

  it('keeps frontend, Edge and persisted freshness on the same deterministic algorithm version', () => {
    expect(DETERMINISTIC_SCORING_VERSION).toBe(CURRENT_ANALYSIS_ALGORITHM_VERSION)
    expect(edgeSource).toContain('const algorithmVersion = SCORING_ALGORITHM_VERSION')
    expect(edgeSource).toContain(`const promptVersion = '${CURRENT_ANALYSIS_PROMPT_VERSION}'`)
    expect(edgeSource).toContain("const analysisContractVersion = 'jobmatch-analysis-contract-vnext-c'")
    expect(edgeSource).toContain('algorithm_version: algorithmVersion')
  })

  it('rebuilds and persists an old offer contract before candidate assessment', () => {
    expect(edgeSource).toContain('analysis_contract_hash,analysis_contract_version')
    expect(edgeSource).toContain('contract.contractVersion === analysisContractVersion')
    expect(edgeSource).toContain('analysis_contract_version: analysisContractVersion')
    expect(edgeSource).toContain('offerIntelligenceRequestSchemas')
    expect(edgeSource).toContain('buildOfferIntelligencePrompt')
    expect(edgeSource).toContain('candidateAssessmentJsonSchema')
    expect(edgeSource).toContain('candidateAssessmentToAnalysisOutput')
    expect(edgeSource).toContain('scoreScoringCriteria')
    expect(edgeSource.indexOf('requestOpenAi(apiKey, buildOfferIntelligencePrompt')).toBeLessThan(edgeSource.indexOf('requestOpenAi(apiKey, prompt'))
  })

  it('passes fetched public offer text to the structured analysis prompt and keeps partial fallback explicit', () => {
    expect(edgeSource).toContain('/functions/v1/fetch-offer-page')
    expect(edgeSource).toContain('buildCandidateAssessmentPrompt(rubric, candidateContext, hardFilter)')
    expect(edgeSource).toContain('analysis_source_snapshot')
    expect(edgeSource).toContain('OPENAI_CRITERIA_MANIFEST_MISMATCH')
    expect(edgeSource).toContain('isOfferIntelligenceRubricRunnable(rubric)')
    expect(edgeSource).toContain('isCandidateAssessmentOutput(parsedAssessment.value, rubric)')
    expect(edgeSource).toContain('OPENAI_CANDIDATE_ASSESSMENT_CONTRACT_INVALID')
    expect(edgeSource).toContain("WORKSPACE_ANALYSIS_RUBRIC_INSUFFICIENT")
    expect(edgeSource).toContain('canonicalSourceHashInput(source)')
    expect(edgeSource).toContain("sourceQuality: 'partial'")
    expect(edgeSource.indexOf('WORKSPACE_ANALYSIS_RUBRIC_INSUFFICIENT')).toBeLessThan(edgeSource.indexOf('requestOpenAi(apiKey, prompt'))
  })

  it('allows empty categories but never an entirely empty provider rubric', () => {
    expect(isAnalysisOutput({ criteria: { ...criteria, growth: [] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(true)
    expect(isAnalysisOutput({ criteria: { experience: [], skills: [], preferences: [], growth: [] }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
  })

  it('keeps UNKNOWN outside the Edge score denominator and never resolves duplicate criteria in favour of MATCH', () => {
    expect(edgeSource).toContain('scoreScoringCriteria(profile.priorities')
    expect(scoringSource).toContain('const totalWeight = scoredEntries.reduce')
    expect(scoringSource).toContain('const knownWeight = knownEntries.reduce')
    expect(scoringSource).toContain('ANALYSIS_CRITERION_DUPLICATE')
    expect(scoringSource).not.toContain('const rank: Record<string, number>')
    expect(scoringSource).not.toContain('const preferred =')
  })

  it('keeps a manually overridden Hard Filter FAIL visible and non-recommendable', () => {
    expect(edgeSource).toContain("hardFilter.status === 'fail' ? 'fail' : 'pass'")
    expect(edgeSource).toContain("analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję'")
  })
})

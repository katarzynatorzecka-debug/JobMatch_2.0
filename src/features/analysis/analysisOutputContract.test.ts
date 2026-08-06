import { describe, expect, it } from 'vitest'
import { isAnalysisOutput } from '../../../supabase/functions/_shared/jobAnalysisOutputSchema'
import edgeSource from '../../../supabase/functions/analyze-job-match/index.ts?raw'
import { DETERMINISTIC_SCORING_VERSION } from './deterministicScoring'
import { CURRENT_ANALYSIS_ALGORITHM_VERSION } from '../workspace/analysisQueue'

const criteria = Object.fromEntries(['experience', 'skills', 'preferences', 'growth'].map((category) => [category, { outcome: 'MATCH', rationale: 'Potwierdzone w znormalizowanych danych.', evidence: ['Dane oferty.'], confidence: 80 }]))

describe('AI criterion output contract', () => {
  it('accepts only criterion outcomes rather than an AI-generated final score', () => {
    expect(isAnalysisOutput({ criteria, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(true)
  })

  it('rejects a missing criterion and an unsupported outcome', () => {
    expect(isAnalysisOutput({ criteria: { ...criteria, growth: undefined }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
    expect(isAnalysisOutput({ criteria: { ...criteria, skills: { ...criteria.skills, outcome: 'MAYBE' } }, summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [] })).toBe(false)
  })

  it('keeps frontend, Edge and persisted freshness on the same deterministic algorithm version', () => {
    expect(DETERMINISTIC_SCORING_VERSION).toBe(CURRENT_ANALYSIS_ALGORITHM_VERSION)
    expect(edgeSource).toContain(`const algorithmVersion = '${DETERMINISTIC_SCORING_VERSION}'`)
    expect(edgeSource).toContain('algorithm_version: algorithmVersion')
  })

  it('keeps a manually overridden Hard Filter FAIL visible and non-recommendable', () => {
    expect(edgeSource).toContain("hardFilter.status === 'fail' ? 'fail' : 'pass'")
    expect(edgeSource).toContain("analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję'")
  })
})

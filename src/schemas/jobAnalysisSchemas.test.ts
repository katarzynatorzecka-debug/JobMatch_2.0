import { describe, expect, it } from 'vitest'
import { validateJobAnalysis } from './jobAnalysisSchemas'

const valid = { offerId: 'offer-1', overallScore: 72, categoryScores: { experience: { score: 70, rationale: 'Zbieżne zadania.' }, skills: { score: 75, rationale: 'Istotne umiejętności.' }, preferences: { score: 68, rationale: 'Część preferencji potwierdzona.' }, growth: { score: 74, rationale: 'Rola wspiera kierunek.' } }, recommendation: 'Warto aplikować', summary: 'Dobre dopasowanie.', strengths: ['Automatyzacja'], risks: ['Brak widełek'], missingInformation: ['wynagrodzenie'], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'test', provisional: false }, createdAt: '2026-07-29T10:00:00.000Z', status: 'ready' }

describe('JobAnalysis schema', () => {
  it('accepts a complete JobAnalysis', () => expect(validateJobAnalysis(valid).success).toBe(true))
  it('rejects score outside range', () => expect(validateJobAnalysis({ ...valid, overallScore: 101 }).success).toBe(false))
  it('rejects missing category', () => expect(validateJobAnalysis({ ...valid, categoryScores: { ...valid.categoryScores, growth: undefined } }).success).toBe(false))
  it('rejects unsupported recommendation', () => expect(validateJobAnalysis({ ...valid, recommendation: 'Może' }).success).toBe(false))
  it('rejects incomplete model response', () => expect(validateJobAnalysis({ offerId: 'offer-1', overallScore: 40 }).success).toBe(false))
  it('preserves UNKNOWN category data without coercing it to a zero score', () => expect(validateJobAnalysis({ ...valid, categoryScores: { ...valid.categoryScores, growth: { score: null, rationale: 'Brak danych.' } } }).success).toBe(true))
  it('accepts the dimension-based scoring contract with calibration metadata', () => expect(validateJobAnalysis({ ...valid, categoryScores: { ...valid.categoryScores, growth: { score: null, rationale: '' } }, scoring: { algorithmVersion: 'jobmatch-deterministic-r10-critical-priority', weights: { employerFit: 80, userCompatibility: 20 }, variantId: 'critical-priority', calibrationStatus: 'pending_human_scoring_gate', employerFitScore: 3, userCompatibilityScore: 50, importanceWeights: { critical: 1.75, core: 1, preferred: 0.5 }, coverage: 100, criterionConfidence: 80, reliability: 'standard', scoredCategories: ['skills'], criterionCount: 7, knownCriterionCount: 7, unknownCriterionCount: 0 } }).success).toBe(true))
})

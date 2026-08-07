import { expect, test } from 'vitest'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'

const criterion = { id: 'criterion-1', requirement: 'Wymaganie testowe', outcome: 'MATCH' as const, rationale: 'Potwierdzone dowodami.', profileEvidence: ['Profil'], offerEvidence: ['Oferta'], confidence: 80 }

test('accepts persisted Phase 4B category summaries and fractional coverage', () => {
  const result = validateJobAnalysis({
    offerId: 'offer-1', overallScore: 80,
    categoryScores: { experience: { score: 80, rationale: 'x'.repeat(6001) }, skills: { score: 80, rationale: 'Krótka synteza.' }, preferences: { score: 80, rationale: 'Krótka synteza.' }, growth: { score: 80, rationale: 'Krótka synteza.' } },
    recommendation: 'Warto aplikować', summary: 'Podsumowanie.', strengths: [], risks: [], missingInformation: [], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'test', provisional: true }, createdAt: '2026-08-06T12:00:00.000Z', status: 'ready',
    criteria: { experience: [criterion], skills: [criterion], preferences: [criterion], growth: [criterion] },
    scoring: { algorithmVersion: 'test', weights: { experience: 35, skills: 30, preferences: 20, growth: 15 }, coverage: 87.5, criterionConfidence: 80, reliability: 'standard', scoredCategories: ['experience', 'skills', 'preferences', 'growth'], criterionCount: 4, knownCriterionCount: 4, unknownCriterionCount: 0 },
  })
  expect(result.success).toBe(true)
})

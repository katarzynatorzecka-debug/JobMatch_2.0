import type { AnalysisCategory, AnalysisCriteria, AnalysisCriterion, CriterionOutcome, JobAnalysis, ScoringBreakdown } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import { assertAtomicCriteria, deduplicateAtomicCriteria } from './atomicCriteria'
import { activeScoringVariantId, outcomePercent, scoreScoringCriteria, scoringWeightVariants, SCORING_ALGORITHM_VERSION, type ScoringCriteria } from '../../../supabase/functions/_shared/scoringCalibration'

export const DETERMINISTIC_SCORING_VERSION = SCORING_ALGORITHM_VERSION
export { activeScoringVariantId, outcomePercent, scoringWeightVariants }

export type DeterministicScore = {
  overallScore: number
  recommendation: JobAnalysis['recommendation']
  categoryScores: Record<AnalysisCategory, number | null>
  scoring: ScoringBreakdown
}

const categories: AnalysisCategory[] = ['experience', 'skills', 'preferences', 'growth']

function normalizeLegacyCriteria(criteria: AnalysisCriteria): Record<AnalysisCategory, AnalysisCriterion[]> {
  return Object.fromEntries(categories.map((category) => {
    const value = criteria[category]
    return [category, Array.isArray(value) ? value : [{ id: `req:legacy-${category}`, canonicalKey: `req:legacy-${category}`, requirement: category, outcome: value.outcome, rationale: value.rationale, profileEvidence: value.evidence, offerEvidence: value.evidence, confidence: value.confidence }]]
  })) as Record<AnalysisCategory, AnalysisCriterion[]>
}

function recommendationFor(score: number, coverage: number, reliability: 'standard' | 'limited', hardFilter?: 'pass' | 'needs_review' | 'fail'): JobAnalysis['recommendation'] {
  if (hardFilter === 'fail') return 'Nie rekomenduję'
  if (reliability === 'limited' && score > 0) return 'Wymaga sprawdzenia'
  return score >= 75 && coverage >= 75 && reliability === 'standard' ? 'Warto aplikować' : score >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję'
}

export function calculateDeterministicScore(profile: Pick<UserProfile, 'priorities'>, outcomes: Record<AnalysisCategory, CriterionOutcome>, criterionConfidences?: Partial<Record<AnalysisCategory, number>>): DeterministicScore {
  const criteria = Object.fromEntries(categories.map((category) => [category, [{ id: `req:${category}`, canonicalKey: `req:${category}`, requirement: category, outcome: outcomes[category], rationale: category, profileEvidence: outcomes[category] === 'UNKNOWN' ? [] : ['legacy'], offerEvidence: outcomes[category] === 'UNKNOWN' ? [] : ['legacy'], confidence: criterionConfidences?.[category] ?? 0 }]])) as AnalysisCriteria
  return calculateCriterionLevelScore(profile, criteria)
}

export function calculateCriterionLevelScore(profile: Pick<UserProfile, 'priorities'>, criteria: AnalysisCriteria): DeterministicScore {
  assertAtomicCriteria(criteria)
  const normalized = deduplicateAtomicCriteria(criteria)
  const result = scoreScoringCriteria(profile.priorities, normalized as unknown as ScoringCriteria)
  return {
    overallScore: result.overallScore,
    recommendation: recommendationFor(result.overallScore, result.scoring.coverage, result.scoring.reliability),
    categoryScores: result.categoryScores,
    scoring: result.scoring,
  }
}

export function scoreAnalysisCriteria(profile: Pick<UserProfile, 'priorities'>, criteria: AnalysisCriteria, hardFilter?: 'pass' | 'needs_review' | 'fail') {
  const normalized = normalizeLegacyCriteria(criteria)
  const result = scoreScoringCriteria(profile.priorities, normalized as unknown as ScoringCriteria)
  return { ...result, recommendation: recommendationFor(result.overallScore, result.scoring.coverage, result.scoring.reliability, hardFilter) }
}

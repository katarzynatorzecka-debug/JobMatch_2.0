import type { AnalysisCategory, CriterionOutcome, Recommendation, ScoringBreakdown } from '../../contracts/jobAnalysis'
import type { ProfilePriority, UserProfile } from '../../contracts/profile'

export const DETERMINISTIC_SCORING_VERSION = 'jobmatch-deterministic-r1'
const defaultPriorities: ProfilePriority[] = ['experience', 'skills', 'preferences', 'growth']
const weightsByRank = [35, 30, 20, 15] as const
export const outcomePercent: Record<CriterionOutcome, number | null> = { MATCH: 100, PARTIAL: 60, NO_MATCH: 0, UNKNOWN: null }

export type DeterministicScore = {
  overallScore: number
  recommendation: Recommendation
  categoryScores: Record<AnalysisCategory, number | null>
  scoring: ScoringBreakdown
}

function normalizedPriorities(priorities: ProfilePriority[]) {
  if (priorities.length !== 4 || new Set(priorities).size !== 4 || priorities.some((priority) => !defaultPriorities.includes(priority))) throw new Error('PROFILE_PRIORITIES_INVALID')
  return priorities
}

export function calculateDeterministicScore(profile: Pick<UserProfile, 'priorities'>, outcomes: Record<AnalysisCategory, CriterionOutcome>, criterionConfidences?: Partial<Record<AnalysisCategory, number>>): DeterministicScore {
  const ordered = normalizedPriorities(profile.priorities)
  const weights = Object.fromEntries(ordered.map((category, index) => [category, weightsByRank[index]])) as Record<AnalysisCategory, number>
  const scoredCategories = ordered.filter((category) => outcomePercent[outcomes[category]] !== null)
  const scoredWeight = scoredCategories.reduce((total, category) => total + weights[category], 0)
  const weightedPoints = scoredCategories.reduce((total, category) => total + weights[category] * (outcomePercent[outcomes[category]] ?? 0), 0)
  const overallScore = scoredWeight ? Math.round(weightedPoints / scoredWeight) : 0
  const coverage = scoredWeight
  const confidenceValues = scoredCategories.reduce<number[]>((values, category) => {
    const value = criterionConfidences?.[category]
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100) values.push(value)
    return values
  }, [])
  const criterionConfidence = confidenceValues.length === scoredCategories.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length) : null
  const reliability = coverage < 75 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  const recommendation: Recommendation = overallScore >= 75 && coverage >= 75 && reliability === 'standard' ? 'Warto aplikować' : overallScore >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję'
  return {
    overallScore,
    recommendation,
    categoryScores: Object.fromEntries(defaultPriorities.map((category) => [category, outcomePercent[outcomes[category]]])) as Record<AnalysisCategory, number | null>,
    scoring: { algorithmVersion: DETERMINISTIC_SCORING_VERSION, weights, coverage, criterionConfidence, reliability, scoredCategories },
  }
}

export function scoreBand(score: number) { return score >= 75 ? 'wysokie dopasowanie' : score >= 50 ? 'średnie dopasowanie' : 'niskie dopasowanie' }

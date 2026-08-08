import type { AnalysisCategory, AnalysisCriteria, AnalysisCriterion, CriterionOutcome, Recommendation, ScoringBreakdown } from '../../contracts/jobAnalysis'
import type { ProfilePriority, UserProfile } from '../../contracts/profile'

export const DETERMINISTIC_SCORING_VERSION = 'jobmatch-deterministic-r3'
const defaultPriorities: ProfilePriority[] = ['experience', 'skills', 'preferences', 'growth']
export const scoringWeights: Record<AnalysisCategory, number> = { experience: 35, skills: 30, preferences: 25, growth: 10 }
export const outcomePercent: Record<CriterionOutcome, number> = { MATCH: 100, PARTIAL: 60, NO_MATCH: 0, UNKNOWN: 50 }

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
  const criteria = Object.fromEntries(defaultPriorities.map((category) => [category, [{ id: category, requirement: category, outcome: outcomes[category], rationale: category, profileEvidence: outcomes[category] === 'UNKNOWN' ? [] : ['legacy'], offerEvidence: outcomes[category] === 'UNKNOWN' ? [] : ['legacy'], confidence: criterionConfidences?.[category] ?? 0 }]])) as AnalysisCriteria
  return calculateCriterionLevelScore(profile, criteria)
}

export function calculateCriterionLevelScore(profile: Pick<UserProfile, 'priorities'>, criteria: AnalysisCriteria): DeterministicScore {
  normalizedPriorities(profile.priorities)
  const weights = scoringWeights
  const categoryCriteria = (category: AnalysisCategory): AnalysisCriterion[] => {
    const value = criteria[category]
    if (Array.isArray(value)) return value
    return [{ id: `legacy-${category}`, requirement: category, outcome: value.outcome, rationale: value.rationale, profileEvidence: value.evidence, offerEvidence: value.evidence, confidence: value.confidence }]
  }
  const entries = defaultPriorities.flatMap((category) => categoryCriteria(category).map((criterion) => ({ category, criterion, weight: weights[category] / Math.max(1, categoryCriteria(category).length) })))
  const known = entries.filter(({ criterion }) => criterion.outcome !== 'UNKNOWN')
  const scoredCategories = defaultPriorities.filter((category) => categoryCriteria(category).some((criterion) => criterion.outcome !== 'UNKNOWN'))
  const scoredWeight = known.reduce((total, entry) => total + entry.weight, 0)
  const weightedPoints = entries.reduce((total, entry) => total + entry.weight * outcomePercent[entry.criterion.outcome], 0)
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0)
  const overallScore = totalWeight ? Math.round(weightedPoints / totalWeight) : 0
  const coverage = scoredWeight
  const confidenceValues = known.filter(({ criterion }) => Number.isInteger(criterion.confidence) && criterion.confidence >= 0 && criterion.confidence <= 100)
  const criterionConfidence = confidenceValues.length === known.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, entry) => total + entry.weight * entry.criterion.confidence, 0) / scoredWeight) : null
  const reliability = coverage < 85 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  const recommendation: Recommendation = overallScore >= 75 && coverage >= 85 && reliability === 'standard' ? 'Warto aplikować' : overallScore >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję'
  return {
    overallScore,
    recommendation,
    categoryScores: Object.fromEntries(defaultPriorities.map((category) => {
      const categoryEntries = categoryCriteria(category)
      const score = categoryEntries.length ? Math.round(categoryEntries.reduce((total, criterion) => total + outcomePercent[criterion.outcome], 0) / categoryEntries.length) : null
      return [category, score]
    })) as Record<AnalysisCategory, number | null>,
    scoring: { algorithmVersion: DETERMINISTIC_SCORING_VERSION, weights, coverage, criterionConfidence, reliability, scoredCategories, criterionCount: entries.length, knownCriterionCount: known.length, unknownCriterionCount: entries.length - known.length },
  }
}

export function scoreBand(score: number) { return score >= 75 ? 'wysokie dopasowanie' : score >= 50 ? 'średnie dopasowanie' : 'niskie dopasowanie' }

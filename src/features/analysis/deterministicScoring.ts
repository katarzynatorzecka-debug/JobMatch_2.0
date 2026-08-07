import type { AnalysisCategory, AnalysisCriteria, AnalysisCriterion, CriterionOutcome, Recommendation, ScoringBreakdown } from '../../contracts/jobAnalysis'
import type { ProfilePriority, UserProfile } from '../../contracts/profile'

export const DETERMINISTIC_SCORING_VERSION = 'jobmatch-deterministic-r2'
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
  const criteria = Object.fromEntries(defaultPriorities.map((category) => [category, [{ id: category, requirement: category, outcome: outcomes[category], rationale: category, profileEvidence: outcomePercent[outcomes[category]] === null ? [] : ['legacy'], offerEvidence: outcomePercent[outcomes[category]] === null ? [] : ['legacy'], confidence: criterionConfidences?.[category] ?? 0 }]])) as AnalysisCriteria
  return calculateCriterionLevelScore(profile, criteria)
}

export function calculateCriterionLevelScore(profile: Pick<UserProfile, 'priorities'>, criteria: AnalysisCriteria): DeterministicScore {
  const ordered = normalizedPriorities(profile.priorities)
  const weights = Object.fromEntries(ordered.map((category, index) => [category, weightsByRank[index]])) as Record<AnalysisCategory, number>
  const categoryCriteria = (category: AnalysisCategory): AnalysisCriterion[] => {
    const value = criteria[category]
    if (Array.isArray(value)) return value
    return [{ id: `legacy-${category}`, requirement: category, outcome: value.outcome, rationale: value.rationale, profileEvidence: value.evidence, offerEvidence: value.evidence, confidence: value.confidence }]
  }
  const entries = ordered.flatMap((category) => categoryCriteria(category).map((criterion) => ({ category, criterion, weight: weights[category] / Math.max(1, categoryCriteria(category).length) })))
  const known = entries.filter(({ criterion }) => outcomePercent[criterion.outcome] !== null)
  const scoredCategories = ordered.filter((category) => categoryCriteria(category).some((criterion) => outcomePercent[criterion.outcome] !== null))
  const scoredWeight = known.reduce((total, entry) => total + entry.weight, 0)
  const weightedPoints = known.reduce((total, entry) => total + entry.weight * (outcomePercent[entry.criterion.outcome] ?? 0), 0)
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0)
  const overallScore = totalWeight ? Math.round(weightedPoints / totalWeight) : 0
  const coverage = scoredWeight
  const confidenceValues = known.filter(({ criterion }) => Number.isInteger(criterion.confidence) && criterion.confidence >= 0 && criterion.confidence <= 100)
  const criterionConfidence = confidenceValues.length === known.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, entry) => total + entry.weight * entry.criterion.confidence, 0) / scoredWeight) : null
  const reliability = coverage < 75 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  const recommendation: Recommendation = overallScore >= 75 && coverage >= 75 && reliability === 'standard' ? 'Warto aplikować' : overallScore >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję'
  return {
    overallScore,
    recommendation,
    categoryScores: Object.fromEntries(defaultPriorities.map((category) => {
      const categoryKnown = categoryCriteria(category).filter((criterion) => outcomePercent[criterion.outcome] !== null)
      const score = categoryKnown.length ? Math.round(categoryKnown.reduce((total, criterion) => total + (outcomePercent[criterion.outcome] ?? 0), 0) / categoryKnown.length) : null
      return [category, score]
    })) as Record<AnalysisCategory, number | null>,
    scoring: { algorithmVersion: DETERMINISTIC_SCORING_VERSION, weights, coverage, criterionConfidence, reliability, scoredCategories, criterionCount: entries.length, knownCriterionCount: known.length, unknownCriterionCount: entries.length - known.length },
  }
}

export function scoreBand(score: number) { return score >= 75 ? 'wysokie dopasowanie' : score >= 50 ? 'średnie dopasowanie' : 'niskie dopasowanie' }

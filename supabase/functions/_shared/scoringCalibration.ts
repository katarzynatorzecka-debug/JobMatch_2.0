import { analysisCategories } from './jobAnalysisOutputSchema.ts'

export type ScoringCategory = (typeof analysisCategories)[number]
export type ScoringOutcome = 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN'
export type ScoringImportance = 'critical' | 'core' | 'preferred'
export type ScoringDimension = 'employerFit' | 'userCompatibility'

export type ScoringCriterion = {
  id: string
  canonicalKey?: string
  outcome: ScoringOutcome
  confidence: number
  type?: 'required_skill' | 'required_experience' | 'language' | 'responsibility_capability' | 'employment_condition' | 'preferred_qualification'
  importance?: ScoringImportance
}

export type ScoringCriteria = Record<ScoringCategory, ScoringCriterion[]>

export type ScoringWeightVariant = {
  id: string
  label: string
  dimensionWeights: { employerFit: 80; userCompatibility: 20 }
  importanceWeights: Record<ScoringImportance, number>
}

/**
 * These are calibration candidates, not a final product decision. The human
 * scoring gate must select or revise the importance mapping before it is
 * treated as permanent.
 */
export const scoringWeightVariants: ScoringWeightVariant[] = [
  { id: 'balanced-provisional', label: 'Prowizorycznie zbalansowane', dimensionWeights: { employerFit: 80, userCompatibility: 20 }, importanceWeights: { critical: 1.25, core: 1, preferred: 0.75 } },
  { id: 'critical-priority', label: 'Priorytet wymagań krytycznych', dimensionWeights: { employerFit: 80, userCompatibility: 20 }, importanceWeights: { critical: 1.75, core: 1, preferred: 0.5 } },
  { id: 'critical-dominant', label: 'Silna ochrona wymagań krytycznych', dimensionWeights: { employerFit: 80, userCompatibility: 20 }, importanceWeights: { critical: 2.5, core: 1, preferred: 0.25 } },
]

export const activeScoringVariantId = 'critical-priority'
export const SCORING_CALIBRATION_STATUS = 'pending_human_scoring_gate' as const
export const SCORING_ALGORITHM_VERSION = 'jobmatch-deterministic-r10-critical-priority'
export const outcomePercent: Record<ScoringOutcome, number | null> = { MATCH: 100, PARTIAL: 60, NO_MATCH: 0, UNKNOWN: null }

function variantById(variantId: string) {
  const variant = scoringWeightVariants.find((candidate) => candidate.id === variantId)
  if (!variant) throw new Error(`SCORING_VARIANT_UNKNOWN:${variantId}`)
  return variant
}

function dimensionFor(category: ScoringCategory, criterion: ScoringCriterion): ScoringDimension {
  // Employment conditions describe the user's compatibility. Other rubric
  // criteria remain employer-fit signals even when shown in preferences.
  if (criterion.type === 'employment_condition' || (criterion.type === undefined && category === 'preferences')) return 'userCompatibility'
  return 'employerFit'
}

function importanceFor(category: ScoringCategory, criterion: ScoringCriterion): ScoringImportance {
  if (criterion.importance) return criterion.importance
  return category === 'preferences' ? 'preferred' : 'core'
}

function validatePriorities(priorities: readonly string[]) {
  if (priorities.length !== analysisCategories.length || new Set(priorities).size !== analysisCategories.length || priorities.some((category) => !analysisCategories.includes(category as ScoringCategory))) throw new Error('PROFILE_PRIORITIES_INVALID')
}

export type ScoringResult = {
  overallScore: number
  categoryScores: Record<ScoringCategory, number | null>
  scoring: {
    algorithmVersion: string
    weights: { employerFit: 80; userCompatibility: 20 }
    variantId: string
    calibrationStatus: typeof SCORING_CALIBRATION_STATUS
    importanceWeights: Record<ScoringImportance, number>
    employerFitScore: number | null
    userCompatibilityScore: number | null
    coverage: number
    criterionConfidence: number | null
    reliability: 'standard' | 'limited'
    scoredCategories: ScoringCategory[]
    criterionCount: number
    knownCriterionCount: number
    unknownCriterionCount: number
  }
}

export function scoreScoringCriteria(priorities: readonly string[], criteria: ScoringCriteria, variantId = activeScoringVariantId): ScoringResult {
  validatePriorities(priorities)
  const variant = variantById(variantId)
  const entries = analysisCategories.flatMap((category) => (criteria[category] ?? []).map((criterion) => ({ category, criterion, dimension: dimensionFor(category, criterion), importance: importanceFor(category, criterion), factor: variant.importanceWeights[importanceFor(category, criterion)] })))
  const seenRequirements = new Set<string>()
  for (const entry of entries) {
    const identity = entry.criterion.canonicalKey ?? entry.criterion.id
    if (seenRequirements.has(identity)) throw new Error(`ANALYSIS_CRITERION_DUPLICATE:${identity}`)
    seenRequirements.add(identity)
  }
  const activeDimensions = new Set(entries.map((entry) => entry.dimension))
  const dimensionFactorTotals = Object.fromEntries((['employerFit', 'userCompatibility'] as ScoringDimension[]).map((dimension) => [dimension, entries.filter((entry) => entry.dimension === dimension).reduce((total, entry) => total + entry.factor, 0)])) as Record<ScoringDimension, number>
  const dimensionBudgets = variant.dimensionWeights
  const scoredEntries = entries.map((entry) => ({ ...entry, weight: dimensionBudgets[entry.dimension] * entry.factor / dimensionFactorTotals[entry.dimension] }))
  const totalWeight = scoredEntries.reduce((total, entry) => total + entry.weight, 0)
  const knownEntries = scoredEntries.filter(({ criterion }) => criterion.outcome !== 'UNKNOWN')
  const knownWeight = knownEntries.reduce((total, entry) => total + entry.weight, 0)
  const weightedPoints = knownEntries.reduce((total, entry) => total + entry.weight * (outcomePercent[entry.criterion.outcome] ?? 0), 0)
  const score = totalWeight ? Math.round(weightedPoints / totalWeight) : 0
  const confidenceValues = knownEntries.filter(({ criterion }) => Number.isInteger(criterion.confidence) && criterion.confidence >= 0 && criterion.confidence <= 100)
  const criterionConfidence = confidenceValues.length === knownEntries.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, entry) => total + entry.weight * entry.criterion.confidence, 0) / knownWeight) : null
  const coverage = totalWeight ? Math.round((knownWeight / totalWeight) * 100) : 0
  const reliability = coverage < 75 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  const dimensionScore = (dimension: ScoringDimension) => {
    const dimensionEntries = scoredEntries.filter((entry) => entry.dimension === dimension)
    const known = dimensionEntries.filter(({ criterion }) => criterion.outcome !== 'UNKNOWN')
    if (!known.length) return null
    const dimensionWeight = dimensionEntries.reduce((total, entry) => total + entry.weight, 0)
    return Math.round(known.reduce((total, entry) => total + entry.weight * (outcomePercent[entry.criterion.outcome] ?? 0), 0) / dimensionWeight)
  }
  const categoryScores = Object.fromEntries(analysisCategories.map((category) => {
    const categoryEntries = scoredEntries.filter((entry) => entry.category === category)
    const known = categoryEntries.filter(({ criterion }) => criterion.outcome !== 'UNKNOWN')
    if (!known.length) return [category, null]
    const categoryWeight = categoryEntries.reduce((total, entry) => total + entry.factor, 0)
    return [category, Math.round(known.reduce((total, entry) => total + entry.factor * (outcomePercent[entry.criterion.outcome] ?? 0), 0) / categoryWeight)]
  })) as Record<ScoringCategory, number | null>
  return {
    overallScore: score,
    categoryScores,
    scoring: {
      algorithmVersion: SCORING_ALGORITHM_VERSION,
      weights: dimensionBudgets,
      variantId: variant.id,
      calibrationStatus: SCORING_CALIBRATION_STATUS,
      importanceWeights: variant.importanceWeights,
      employerFitScore: activeDimensions.has('employerFit') ? dimensionScore('employerFit') : null,
      userCompatibilityScore: activeDimensions.has('userCompatibility') ? dimensionScore('userCompatibility') : null,
      coverage,
      criterionConfidence,
      reliability,
      scoredCategories: analysisCategories.filter((category) => (criteria[category] ?? []).some((criterion) => criterion.outcome !== 'UNKNOWN')),
      criterionCount: entries.length,
      knownCriterionCount: knownEntries.length,
      unknownCriterionCount: entries.length - knownEntries.length,
    },
  }
}

export type ScoringCalibrationCase = { id: string; criteria: ScoringCriteria }
export type ScoringCalibrationReport = {
  contractVersion: 'jobmatch-scoring-calibration-r1'
  status: typeof SCORING_CALIBRATION_STATUS
  activeVariantId: string
  dimensionWeights: { employerFit: 80; userCompatibility: 20 }
  cases: Array<{ id: string; variants: Array<{ variantId: string; overallScore: number; coverage: number; employerFitScore: number | null; userCompatibilityScore: number | null }> }>
}

export function buildScoringCalibrationReport(priorities: readonly string[], cases: ScoringCalibrationCase[]): ScoringCalibrationReport {
  return {
    contractVersion: 'jobmatch-scoring-calibration-r1',
    status: SCORING_CALIBRATION_STATUS,
    activeVariantId: activeScoringVariantId,
    dimensionWeights: { employerFit: 80, userCompatibility: 20 },
    cases: cases.map((calibrationCase) => ({ id: calibrationCase.id, variants: scoringWeightVariants.map((variant) => {
      const result = scoreScoringCriteria(priorities, calibrationCase.criteria, variant.id)
      return { variantId: variant.id, overallScore: result.overallScore, coverage: result.scoring.coverage, employerFitScore: result.scoring.employerFitScore, userCompatibilityScore: result.scoring.userCompatibilityScore }
    }) })),
  }
}

import type { HardFilterStatus } from './hardFilter'
import type { OfferSourceErrorCode, OfferSourceResult } from './offerSource'
export type SourceQuality = 'full' | 'partial' | 'unavailable' | 'fixture'
export type AnalysisStatus = 'ready' | 'retry' | 'rejected'
export type Recommendation = 'Warto aplikować' | 'Wymaga sprawdzenia' | 'Nie rekomenduję'
export type AnalysisCategory = 'experience' | 'skills' | 'preferences' | 'growth'
export type CriterionOutcome = 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN'
export type CriterionImportance = 'critical' | 'core' | 'preferred'
export type CriterionType = 'required_skill' | 'required_experience' | 'language' | 'responsibility_capability' | 'employment_condition' | 'preferred_qualification'
export interface CategoryScore { score: number | null; rationale: string }
export interface AnalysisCriterion {
  id: string
  /** Stable job-requirement identity. Kept optional so historical analysis rows remain readable. */
  canonicalKey?: string
  requirement: string
  /** Employer-rubric metadata. Optional for historical/demo rows. */
  type?: CriterionType
  importance?: CriterionImportance
  outcome: CriterionOutcome
  rationale: string
  profileEvidence: string[]
  offerEvidence: string[]
  confidence: number
}
export interface LegacyAnalysisCriterion { outcome: CriterionOutcome; rationale: string; evidence: string[]; confidence: number }
export type AnalysisCriteria = Record<AnalysisCategory, AnalysisCriterion[] | LegacyAnalysisCriterion>
export interface ScoringBreakdown {
  algorithmVersion: string
  /** Dimension budgets. Final importance mapping remains calibration-provisional. */
  weights: Record<string, number>
  variantId?: string
  calibrationStatus?: 'pending_human_scoring_gate' | 'approved'
  employerFitScore?: number | null
  userCompatibilityScore?: number | null
  importanceWeights?: Record<CriterionImportance, number>
  coverage: number
  criterionConfidence: number | null
  reliability: 'standard' | 'limited'
  scoredCategories: AnalysisCategory[]
  criterionCount?: number
  knownCriterionCount?: number
  unknownCriterionCount?: number
}
export interface JobAnalysis { offerId: string; overallScore: number; categoryScores: Record<AnalysisCategory, CategoryScore>; recommendation: Recommendation; summary: string; strengths: string[]; risks: string[]; missingInformation: string[]; hardFilterStatus: HardFilterStatus; hardFilterReasons: string[]; sourceQuality: SourceQuality; modelInfo: { provider: 'openai'; model: string; provisional: boolean }; createdAt: string; status: AnalysisStatus; criteria?: AnalysisCriteria; scoring?: ScoringBreakdown }
export interface OfferContent { text: string; sourceQuality: SourceQuality; source: OfferSourceResult; sourceErrorCode?: OfferSourceErrorCode }

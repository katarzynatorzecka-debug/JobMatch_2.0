import type { HardFilterStatus } from './hardFilter'
import type { OfferSourceErrorCode, OfferSourceResult } from './offerSource'
export type SourceQuality = 'full' | 'partial' | 'unavailable' | 'fixture'
export type AnalysisStatus = 'ready' | 'retry' | 'rejected'
export type Recommendation = 'Warto aplikować' | 'Wymaga sprawdzenia' | 'Nie rekomenduję'
export type AnalysisCategory = 'experience' | 'skills' | 'preferences' | 'growth'
export type CriterionOutcome = 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN'
export interface CategoryScore { score: number | null; rationale: string }
export interface AnalysisCriterion { outcome: CriterionOutcome; rationale: string; evidence: string[]; confidence: number }
export interface ScoringBreakdown { algorithmVersion: string; weights: Record<AnalysisCategory, number>; coverage: number; criterionConfidence: number | null; reliability: 'standard' | 'limited'; scoredCategories: AnalysisCategory[] }
export interface JobAnalysis { offerId: string; overallScore: number; categoryScores: Record<AnalysisCategory, CategoryScore>; recommendation: Recommendation; summary: string; strengths: string[]; risks: string[]; missingInformation: string[]; hardFilterStatus: HardFilterStatus; hardFilterReasons: string[]; sourceQuality: SourceQuality; modelInfo: { provider: 'openai'; model: string; provisional: boolean }; createdAt: string; status: AnalysisStatus; criteria?: Record<AnalysisCategory, AnalysisCriterion>; scoring?: ScoringBreakdown }
export interface OfferContent { text: string; sourceQuality: SourceQuality; source: OfferSourceResult; sourceErrorCode?: OfferSourceErrorCode }

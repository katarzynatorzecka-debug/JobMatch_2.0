import type { HardFilterStatus } from './hardFilter'
import type { OfferSourceErrorCode, OfferSourceResult } from './offerSource'
export type SourceQuality = 'full' | 'partial' | 'unavailable' | 'fixture'
export type AnalysisStatus = 'ready' | 'retry' | 'rejected'
export type Recommendation = 'Warto aplikować' | 'Wymaga sprawdzenia' | 'Nie rekomenduję'
export type AnalysisCategory = 'experience' | 'skills' | 'preferences' | 'growth'
export interface CategoryScore { score: number; rationale: string }
export interface JobAnalysis { offerId: string; overallScore: number; categoryScores: Record<AnalysisCategory, CategoryScore>; recommendation: Recommendation; summary: string; strengths: string[]; risks: string[]; missingInformation: string[]; hardFilterStatus: HardFilterStatus; hardFilterReasons: string[]; sourceQuality: SourceQuality; modelInfo: { provider: 'openai'; model: string; provisional: boolean }; createdAt: string; status: AnalysisStatus }
export interface OfferContent { text: string; sourceQuality: SourceQuality; source: OfferSourceResult; sourceErrorCode?: OfferSourceErrorCode }

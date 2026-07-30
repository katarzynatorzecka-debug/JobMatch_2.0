import type { FilteredJobOffer } from '../../contracts/hardFilter'
import type { JobAnalysis } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import { AIAnalysisService } from './analysisService'
import type { AnalysisRepository } from './analysisRepository'
import { OfferContentProvider } from './offerContentProvider'
export type AnalysisProgress = { offerId: string; state: 'queued' | 'analyzing' | 'ready' | 'retry' | 'rejected'; error?: string }
export class AnalysisOrchestrator { constructor(private readonly provider: OfferContentProvider, private readonly service: AIAnalysisService, private readonly repository: AnalysisRepository) {} async analyzeAll(profile: UserProfile, items: FilteredJobOffer[], onProgress: (progress: AnalysisProgress) => void): Promise<JobAnalysis[]> { const results: JobAnalysis[] = []; for (const item of items) { if (item.result.status === 'fail') { onProgress({ offerId: item.offer.id, state: 'rejected' }); continue } onProgress({ offerId: item.offer.id, state: 'analyzing' }); let analysis: JobAnalysis; try { analysis = await this.service.analyze(profile, item, this.provider.find(item.offer)) } catch (error) { onProgress({ offerId: item.offer.id, state: 'retry', error: error instanceof Error ? error.message : 'ANALYSIS_REQUEST_FAILED' }); continue } try { await this.repository.save(analysis) } catch { onProgress({ offerId: item.offer.id, state: 'retry', error: 'ANALYSIS_SAVE_FAILED' }); continue } results.push(analysis); onProgress({ offerId: item.offer.id, state: 'ready' }) } return results } }

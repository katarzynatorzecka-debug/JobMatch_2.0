import type { ImportedJobOffer, ImportedReport } from '../../contracts/import'
import type { AnalysisCategory, AnalysisCriterion, CriterionOutcome, JobAnalysis } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import { evaluateOffer } from '../hardFilter/hardFilter'
import { calculateCriterionLevelScore } from './deterministicScoring'
import { enqueueAndProcessAnalysis } from './analysisQueueService'
import type { WorkspaceOfferListItem, WorkspaceRepository } from '../workspace/workspaceRepository'
import { toWorkspaceImportInput } from '../workspace/workspaceRepository'
import { findDemoOffer } from '../../demo/offers'

export type IntegratedOfferState = 'waiting' | 'hard_filtering' | 'queued' | 'processing' | 'completed' | 'rejected' | 'failed'
export type IntegratedOfferProgress = { key: string; offer: ImportedJobOffer; state: IntegratedOfferState; hardFilterStatus?: 'pass' | 'weak' | 'fail'; workspaceOfferId?: string; analysis?: JobAnalysis; error?: string; analysisVersionId?: string | null; freshness?: 'current' | 'stale_profile' | 'stale_offer' | 'stale_algorithm' | 'stale_prompt' | 'stale_model' | 'missing' }
export type IntegratedBatchCounts = { total: number; hardFilterRejected: number; queued: number; processing: number; completed: number; failed: number }
export type BatchReport = { key: string; report: ImportedReport; offers: ImportedJobOffer[] }
export type IntegratedBatchResult = { items: WorkspaceOfferListItem[]; counts: IntegratedBatchCounts; partial: boolean }

const categories: AnalysisCategory[] = ['experience', 'skills', 'preferences', 'growth']
const waitForVisibleTransition = () => new Promise<void>((resolve) => setTimeout(resolve, 140))
const waitForQueueTransition = () => new Promise<void>((resolve) => setTimeout(resolve, 450))
const stableHash = (value: string) => { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }; return (hash >>> 0).toString(36) }

function key(reportKey: string, offer: ImportedJobOffer) { return `${reportKey}:${offer.id}` }
function hardFilterStatus(status: 'pass' | 'weak' | 'fail') { return status === 'weak' ? 'needs_review' : status }

function demoOutcome(offer: ImportedJobOffer, category: AnalysisCategory): CriterionOutcome {
  if (category === 'preferences' && offer.missingFields.length > 0) return 'UNKNOWN'
  if (category === 'experience') return /manager|specialist|automation|marketing/i.test(offer.title) ? 'MATCH' : 'PARTIAL'
  if (category === 'skills') return offer.warnings.length ? 'PARTIAL' : 'MATCH'
  return 'PARTIAL'
}

function baseDemoAnalysis(profile: UserProfile, offer: ImportedJobOffer, hardFilter: 'pass' | 'weak' | 'fail'): JobAnalysis {
  const outcomes = Object.fromEntries(categories.map((category) => [category, demoOutcome(offer, category)])) as Record<AnalysisCategory, CriterionOutcome>
  const criteria = Object.fromEntries(categories.map((category) => {
    const outcome = outcomes[category]
    const rationale = outcome === 'UNKNOWN' ? 'Brak wystarczających danych w rozpoznanej ofercie.' : outcome === 'MATCH' ? 'Dane oferty są zgodne z priorytetem profilu.' : 'Dopasowanie wymaga dalszego sprawdzenia.'
    return [category, [{ id: `req:demo-${category}`, requirement: `Ocena kategorii ${category}.`, outcome, rationale, profileEvidence: outcome === 'UNKNOWN' ? [] : ['Dane profilu demonstracyjnego.'], offerEvidence: offer.missingFields.length && category === 'preferences' ? [] : ['Znormalizowane dane oferty.'], confidence: outcome === 'UNKNOWN' ? 35 : outcome === 'MATCH' ? 78 : 58 } satisfies AnalysisCriterion]]
  })) as Record<AnalysisCategory, AnalysisCriterion[]>
  const deterministic = calculateCriterionLevelScore(profile, criteria)
  const recommendation = hardFilter === 'fail' ? 'Nie rekomenduję' : deterministic.recommendation
  return { offerId: '', overallScore: deterministic.overallScore, categoryScores: Object.fromEntries(categories.map((category) => [category, { score: deterministic.categoryScores[category], rationale: criteria[category][0].rationale }])) as JobAnalysis['categoryScores'], recommendation, summary: deterministic.scoring.reliability === 'limited' ? 'Wynik oparty na ograniczonej liczbie danych.' : 'Wstępne dopasowanie według priorytetów profilu.', strengths: categories.filter((category) => outcomes[category] === 'MATCH').map((category) => `Potwierdzone: ${category}.`), risks: offer.missingFields.length ? [`Brakuje: ${offer.missingFields.join(', ')}.`] : [], missingInformation: offer.missingFields, hardFilterStatus: hardFilter, hardFilterReasons: [], sourceQuality: 'fixture', modelInfo: { provider: 'openai', model: 'demo-fixture', provisional: true }, createdAt: new Date().toISOString(), status: 'ready', criteria, scoring: deterministic.scoring }
}

function demoAnalysis(profile: UserProfile, offer: ImportedJobOffer, hardFilter: 'pass' | 'weak' | 'fail'): JobAnalysis {
  const base = baseDemoAnalysis(profile, offer, hardFilter)
  const sample = findDemoOffer(offer.id)?.demoAssessment
  if (!sample) return base
  const recommendation = sample.status === 'worth' ? 'Warto aplikować' : sample.status === 'rejected' ? 'Nie rekomenduję' : 'Wymaga sprawdzenia'
  return {
    ...base,
    recommendation: hardFilter === 'fail' ? 'Nie rekomenduję' : recommendation,
    summary: sample.recommendation,
    strengths: sample.strengths,
    risks: sample.risks,
  }
}

/**
 * The Edge Function can return while an accepted queue item is still visible as
 * queued/processing.  Poll the durable workspace projection instead of marking
 * the tile completed optimistically or submitting a second provider request.
 */
export async function waitForIntegratedAnalysisCompletion(
  repository: WorkspaceRepository,
  offerId: string,
  options: { maxAttempts?: number; wait?: () => Promise<void> } = {},
): Promise<JobAnalysis> {
  const maxAttempts = options.maxAttempts ?? 60
  const wait = options.wait ?? waitForQueueTransition
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const details = await repository.loadOfferDetails(offerId)
    if (details.listItem?.analysis) return details.listItem.analysis
    if (details.analysisState.errorCode) throw new Error(details.analysisState.errorCode)
    const status = details.analysisState.queueItem?.status
    if (status !== 'queued' && status !== 'processing') throw new Error('ANALYSIS_QUEUE_NOT_COMPLETED')
    await wait()
  }
  throw new Error('ANALYSIS_QUEUE_TIMEOUT')
}

export async function runIntegratedAnalysisBatch(input: {
  repository: WorkspaceRepository
  mode: 'demo' | 'authenticated'
  userId: string
  profile: UserProfile
  reports: BatchReport[]
  onOfferProgress: (entry: IntegratedOfferProgress) => void
  onCounts: (counts: IntegratedBatchCounts) => void
}): Promise<IntegratedBatchResult> {
  const counts: IntegratedBatchCounts = { total: input.reports.reduce((total, report) => total + report.offers.length, 0), hardFilterRejected: 0, queued: 0, processing: 0, completed: 0, failed: 0 }
  const publishCounts = () => input.onCounts({ ...counts })
  const sourceByKey = new Map<string, { offer: ImportedJobOffer; hardFilter: ReturnType<typeof evaluateOffer> }>()
  // Source acquisition is owned by the import path (direct URL) or by the
  // analysis worker (stored/refreshable snapshot). Do not fetch every source
  // again here: a mixed .eml batch must not turn into N extra network calls or
  // overwrite its parsed metadata before Hard Filter.
  for (const report of input.reports) for (const offer of report.offers) {
    const progressKey = key(report.key, offer)
    input.onOfferProgress({ key: progressKey, offer, state: 'hard_filtering' })
    sourceByKey.set(progressKey, { offer, hardFilter: evaluateOffer(input.profile, offer) })
  }
  await waitForVisibleTransition()

  const imported = [] as Array<{ report: BatchReport; sessionId: string }>
  for (const report of input.reports) {
    const result = await input.repository.importReport(toWorkspaceImportInput(input.userId, report.report))
    await input.repository.setActiveImportSession(result.importSessionId)
    imported.push({ report, sessionId: result.importSessionId })
  }
  const workspace = await input.repository.loadWorkspace()
  const canonical = new Map<string, { offerId: string; offerVersionId: string; sourceKeys: string[]; offer: ImportedJobOffer; hardFilter: ReturnType<typeof evaluateOffer> }>()
  for (const importedReport of imported) for (const offer of importedReport.report.offers) {
    const sourceKey = key(importedReport.report.key, offer)
    const link = workspace.importOfferLinks.find((entry) => entry.importSessionId === importedReport.sessionId && entry.rawExternalId === offer.id)
    const current = sourceByKey.get(sourceKey)
    if (!link?.offerVersionId || !current) throw new Error('WORKSPACE_IMPORT_LINK_MISSING')
    const existing = canonical.get(link.jobOfferId)
    if (existing) {
      existing.sourceKeys.push(sourceKey)
    } else {
      canonical.set(link.jobOfferId, { offerId: link.jobOfferId, offerVersionId: link.offerVersionId, sourceKeys: [sourceKey], offer, hardFilter: current.hardFilter })
    }
  }
  await input.repository.persistHardFilterBatch({ profile: input.profile, profileHash: stableHash(JSON.stringify(input.profile)), algorithmVersion: 'hard-filter-v1', items: [...canonical.values()].map((item) => ({ jobOfferId: item.offerId, offerVersionId: item.offerVersionId, status: hardFilterStatus(item.hardFilter.status), reasons: item.hardFilter.reasons, missingInformation: item.hardFilter.missingInformation, checkedCriteria: item.hardFilter.checkedCriteria })) })

  for (const item of canonical.values()) {
    const occurrenceCount = item.sourceKeys.length
    const publishProgress = (entry: Omit<IntegratedOfferProgress, 'key' | 'offer'>) => {
      item.sourceKeys.forEach((sourceKey) => input.onOfferProgress({ key: sourceKey, offer: item.offer, ...entry }))
    }
    if (item.hardFilter.status === 'fail') {
      counts.hardFilterRejected += occurrenceCount; counts.completed += occurrenceCount; publishCounts()
      publishProgress({ state: 'rejected', hardFilterStatus: 'fail', workspaceOfferId: item.offerId })
      continue
    }
    try {
      publishProgress({ state: 'queued', hardFilterStatus: item.hardFilter.status, workspaceOfferId: item.offerId }); counts.queued += occurrenceCount; publishCounts()
      counts.queued -= occurrenceCount; counts.processing += occurrenceCount; publishProgress({ state: 'processing', hardFilterStatus: item.hardFilter.status, workspaceOfferId: item.offerId }); publishCounts()
      await waitForVisibleTransition()
      if (input.mode === 'demo') {
        if (!input.repository.completeLocalAnalysis) throw new Error('DEMO_ANALYSIS_UNAVAILABLE')
        const enqueue = await input.repository.enqueueAnalysis(item.offerId)
        const analysis = demoAnalysis(input.profile, item.offer, item.hardFilter.status)
        analysis.offerId = item.offerId
        await input.repository.completeLocalAnalysis(enqueue.queueItem.id, analysis)
        counts.processing -= occurrenceCount; counts.completed += occurrenceCount; publishCounts()
        publishProgress({ state: 'completed', hardFilterStatus: item.hardFilter.status, workspaceOfferId: item.offerId, analysis })
      } else {
        await enqueueAndProcessAnalysis(input.repository, item.offerId)
        const analysis = await waitForIntegratedAnalysisCompletion(input.repository, item.offerId)
        counts.processing -= occurrenceCount; counts.completed += occurrenceCount; publishCounts()
        publishProgress({ state: 'completed', hardFilterStatus: item.hardFilter.status, workspaceOfferId: item.offerId, analysis })
      }
    } catch (cause) {
      counts.queued = Math.max(0, counts.queued - occurrenceCount); counts.processing = Math.max(0, counts.processing - occurrenceCount); counts.failed += occurrenceCount; publishCounts()
      publishProgress({ state: 'failed', hardFilterStatus: item.hardFilter.status, workspaceOfferId: item.offerId, error: cause instanceof Error ? cause.message : 'ANALYSIS_REQUEST_FAILED' })
    }
  }
  const items = await input.repository.loadOfferList()
  return { items, counts, partial: counts.failed > 0 }
}

export async function retryIntegratedOffer(input: {
  repository: WorkspaceRepository
  mode: 'demo' | 'authenticated'
  profile: UserProfile
  offerId: string
  offer: ImportedJobOffer
  hardFilterStatus: 'pass' | 'weak' | 'fail'
  allowHardFilterFail?: boolean
  onProgress: (entry: Omit<IntegratedOfferProgress, 'key'>) => void
}) {
  input.onProgress({ offer: input.offer, state: 'queued', hardFilterStatus: input.hardFilterStatus, workspaceOfferId: input.offerId })
  input.onProgress({ offer: input.offer, state: 'processing', hardFilterStatus: input.hardFilterStatus, workspaceOfferId: input.offerId })
  await waitForVisibleTransition()
  if (input.mode === 'demo') {
    if (!input.repository.completeLocalAnalysis) throw new Error('DEMO_ANALYSIS_UNAVAILABLE')
    const queued = await input.repository.enqueueAnalysis(input.offerId, { allowHardFilterFail: input.allowHardFilterFail, forceReanalysis: true })
    const analysis = demoAnalysis(input.profile, input.offer, input.hardFilterStatus); analysis.offerId = input.offerId
    await input.repository.completeLocalAnalysis(queued.queueItem.id, analysis)
    input.onProgress({ offer: input.offer, state: 'completed', hardFilterStatus: input.hardFilterStatus, workspaceOfferId: input.offerId, analysis })
    return analysis
  }
  await enqueueAndProcessAnalysis(input.repository, input.offerId, { allowHardFilterFail: input.allowHardFilterFail, forceReanalysis: true })
  const analysis = await waitForIntegratedAnalysisCompletion(input.repository, input.offerId)
  input.onProgress({ offer: input.offer, state: 'completed', hardFilterStatus: input.hardFilterStatus, workspaceOfferId: input.offerId, analysis })
  return analysis
}

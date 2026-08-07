import type { ImportedJobOffer, ImportedReport } from '../../contracts/import'
import type { WorkspaceSnapshot } from '../workspace/workspaceRepository'
import { projectWorkspaceOffer } from '../workspace/workspaceReadModel'
import type { IntegratedAnalysisSession } from './integratedAnalysisSession'
import type { IntegratedOfferProgress } from './integratedAnalysisFlow'

/**
 * A user selecting a file is an explicit choice to build a fresh batch.  The
 * async workspace restore must never race that choice and append an older
 * terminal batch while the new EML file is still being parsed.
 */
export function shouldRestoreWorkspaceImport(input: {
  alreadyRestored: boolean
  isAuthenticated: boolean
  hasBatchEntries: boolean
  pipeline: 'idle' | 'running' | 'complete' | 'partial_complete'
  freshBatchStarted: boolean
}) {
  return !input.alreadyRestored && input.isAuthenticated && !input.freshBatchStarted && (!input.hasBatchEntries || input.pipeline === 'complete' || input.pipeline === 'partial_complete')
}

/**
 * Adding files while a previous persisted batch is terminal begins a new
 * analysis packet. Its terminal progress must not be reused for unrelated
 * offers selected afterwards.
 */
export function shouldResetTerminalBatchForNewFiles(pipeline: 'idle' | 'running' | 'complete' | 'partial_complete') {
  return pipeline === 'complete' || pipeline === 'partial_complete'
}

function itemFor(snapshot: WorkspaceSnapshot, offerId: string) {
  const offer = snapshot.offers.find((candidate) => candidate.id === offerId)
  return offer ? projectWorkspaceOffer(snapshot, offer) : null
}

function importedOffer(snapshot: WorkspaceSnapshot, offerId: string, externalId: string): ImportedJobOffer | null {
  const item = itemFor(snapshot, offerId)
  if (!item) return null
  const data = item.currentVersion?.offerData ?? item.offer.currentData
  const field = (name: string) => typeof data[name] === 'string' ? data[name] : undefined
  const strings = (name: string) => Array.isArray(data[name]) ? data[name].filter((value): value is string => typeof value === 'string') : []
  return { id: externalId, title: item.offer.title, company: item.offer.company, location: item.offer.location ?? undefined, workMode: field('workMode'), contractType: field('contractType'), salary: field('salary'), sourceUrl: item.offer.sourceUrl ?? undefined, sourceLabel: field('sourceLabel'), missingFields: strings('missingFields'), warnings: strings('warnings') }
}

function terminalProgress(snapshot: WorkspaceSnapshot, offerId: string, key: string, offer: ImportedJobOffer): IntegratedOfferProgress | null {
  const item = itemFor(snapshot, offerId)
  if (!item?.hardFilter) return null
  const hardFilterStatus = item.hardFilter.status === 'needs_review' ? 'weak' : item.hardFilter.status
  if (item.analysis) return { key, offer, state: 'completed', hardFilterStatus, workspaceOfferId: offerId, analysis: item.analysis, analysisVersionId: item.analysisState.latestVersion?.id ?? null, freshness: item.analysisState.freshness }
  if (item.hardFilter.status === 'fail') return { key, offer, state: 'rejected', hardFilterStatus: 'fail', workspaceOfferId: offerId, analysisVersionId: null, freshness: item.analysisState.freshness }
  if (item.analysisState.errorCode || item.analysisState.queueItem?.status === 'failed') return { key, offer, state: 'failed', hardFilterStatus, workspaceOfferId: offerId, error: item.analysisState.errorCode ?? 'ANALYSIS_QUEUE_NOT_COMPLETED', analysisVersionId: item.analysisState.latestVersion?.id ?? null, freshness: item.analysisState.freshness }
  return null
}

/** Rebuilds only a terminal persisted batch and never calls a mutation. */
export function restoreActiveWorkspaceImport(snapshot: WorkspaceSnapshot): IntegratedAnalysisSession | null {
  const activeSessionId = snapshot.activeImportSessionId ?? null
  if (!activeSessionId) return null
  const session = snapshot.importSessions.find((candidate) => candidate.id === activeSessionId && candidate.status !== 'reverted')
  if (!session) return null
  const links = snapshot.importOfferLinks.filter((link) => link.importSessionId === session.id)
  if (!links.length) return null
  const offers: ImportedJobOffer[] = []; const progress: Record<string, IntegratedOfferProgress> = {}
  for (const link of links) {
    const offer = importedOffer(snapshot, link.jobOfferId, link.rawExternalId)
    if (!offer) return null
    const key = `${session.id}:${link.rawExternalId}`
    const entry = terminalProgress(snapshot, link.jobOfferId, key, offer)
    if (!entry) return null
    offers.push(offer); progress[key] = entry
  }
  const report: ImportedReport = { version: 1, source: 'rocketjobs-eml', fileName: session.sourceFilename, importedAt: session.createdAt, offers, warnings: [] }
  const values = Object.values(progress); const failed = values.filter((entry) => entry.state === 'failed').length
  return { batch: { status: 'review', entries: [{ kind: 'report', id: session.id, report, removedOfferIds: [] }] }, pipeline: failed ? 'partial_complete' : 'complete', progress, counts: { total: values.length, hardFilterRejected: values.filter((entry) => entry.state === 'rejected').length, queued: 0, processing: 0, completed: values.filter((entry) => entry.state === 'completed' || entry.state === 'rejected').length, failed } }
}

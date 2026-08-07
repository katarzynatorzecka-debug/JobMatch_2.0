import type { ImportedJobOffer, ImportedReport } from '../../contracts/import'
import type { JobAnalysis } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import type { AnalysisEnqueueResult, AnalysisQueueItem, AnalysisVersion, HardFilterResultRecord, ImportOfferLink, OfferUserState, OfferVersion, ProfileVersion, WorkspaceAnalysisState, WorkspaceImportSession, WorkspaceJobAnalysis, WorkspaceJobOffer, WorkspaceProfile } from '../../contracts/workspace'
import { buildCanonicalFingerprint, normalizeSourceUrl } from './deduplication'

export type WorkspaceImportItem = {
  rawExternalId: string
  title: string
  company: string
  location: string | null
  sourceUrl: string | null
  normalizedSourceUrl: string | null
  canonicalFingerprint: string | null
  contentHash: string
  offerData: Record<string, unknown>
}

export type WorkspaceImportInput = {
  sourceType: string
  fileName: string
  importedAt: string
  parserVersion: string
  idempotencyKey: string
  items: WorkspaceImportItem[]
  invalidItems: Array<{ rawExternalId: string; reason: string }>
  warnings: unknown[]
}

export type WorkspaceImportResult = {
  importSessionId: string
  foundCount: number
  newCount: number
  duplicateCount: number
  invalidCount: number
  needsReviewCount: number
  status: 'active' | 'partial'
  createdOfferIds: string[]
  reusedOfferIds: string[]
  possibleDuplicateOfferIds: string[]
  invalidItems: Array<{ rawExternalId: string; reason: string }>
  idempotent: boolean
}

export type LegacyAnalysisIssue = {
  jobOfferId: string
  code: 'WORKSPACE_LEGACY_ANALYSIS_INVALID' | 'WORKSPACE_LEGACY_ANALYSIS_IDENTITY_MISMATCH'
}

export type WorkspaceSnapshot = {
  activeImportSessionId?: string | null
  profile: WorkspaceProfile | null
  importSessions: WorkspaceImportSession[]
  offers: WorkspaceJobOffer[]
  activeOffers: WorkspaceJobOffer[]
  profileVersions: ProfileVersion[]
  offerVersions: OfferVersion[]
  importOfferLinks: ImportOfferLink[]
  offerUserStates: OfferUserState[]
  hardFilterResults: HardFilterResultRecord[]
  analyses: JobAnalysis[]
  legacyAnalysisIssues: LegacyAnalysisIssue[]
  analysisQueue: AnalysisQueueItem[]
  workspaceAnalyses: WorkspaceJobAnalysis[]
  analysisVersions: AnalysisVersion[]
  recentlyViewed: Array<{ userId: string; jobOfferId: string; viewedAt: string }>
}

export type WorkspaceOfferListItem = { offer: WorkspaceJobOffer; currentVersion: OfferVersion | null; userState: OfferUserState | null; hardFilter: HardFilterResultRecord | null; analysis: JobAnalysis | null; analysisState: WorkspaceAnalysisState; activeImportCount: number; importSessionIds: string[]; isActive: boolean }

export type WorkspaceOfferDetails = {
  offer: WorkspaceJobOffer | null
  isActive: boolean
  currentVersion: OfferVersion | null
  versionHistory: OfferVersion[]
  importOccurrences: ImportOfferLink[]
  userState: OfferUserState | null
  analysisMetadata: unknown[]
  analysisHistory: AnalysisVersion[]
  analysisState: WorkspaceAnalysisState
  listItem: WorkspaceOfferListItem | null
}

export type HardFilterBatchItem = { jobOfferId: string; offerVersionId: string; status: 'pass' | 'needs_review' | 'fail'; reasons: unknown[]; missingInformation: unknown[]; checkedCriteria: unknown[] }
export type HardFilterBatchInput = { profile: UserProfile; profileHash: string; algorithmVersion: string; items: HardFilterBatchItem[] }
export type HardFilterBatchResult = { profileVersionId: string; hardFilterResultIds: string[] }

export function assertUniqueHardFilterItems(items: HardFilterBatchItem[]) {
  const offerIds = new Set<string>()
  for (const item of items) {
    if (offerIds.has(item.jobOfferId)) throw new Error('WORKSPACE_DUPLICATE_HARD_FILTER_ITEM')
    offerIds.add(item.jobOfferId)
  }
}

export type RevertImportResult = { importSessionId: string; status: 'reverted' }
export type ReactivateImportResult = { importSessionId: string; status: 'active' | 'partial' }

export interface WorkspaceRepository {
  loadWorkspace(): Promise<WorkspaceSnapshot>
  loadOfferList(includeHistorical?: boolean): Promise<WorkspaceOfferListItem[]>
  loadOfferDetails(offerId: string): Promise<WorkspaceOfferDetails>
  setActiveImportSession(importSessionId: string | null): Promise<void>
  importReport(input: WorkspaceImportInput): Promise<WorkspaceImportResult>
  persistHardFilterBatch(input: HardFilterBatchInput): Promise<HardFilterBatchResult>
  setFavorite(offerId: string, favorite: boolean): Promise<void>
  setApplied(offerId: string, applied: boolean): Promise<void>
  excludeOffer(offerId: string): Promise<void>
  restoreOffer(offerId: string): Promise<void>
  markViewed(offerId: string): Promise<void>
  listImportSessions(): Promise<WorkspaceImportSession[]>
  revertImport(importSessionId: string): Promise<RevertImportResult>
  reactivateImport(importSessionId: string): Promise<ReactivateImportResult>
  enqueueAnalysis(offerId: string, options?: { allowHardFilterFail?: boolean; forceReanalysis?: boolean }): Promise<AnalysisEnqueueResult>
  cancelQueuedAnalysis(queueItemId: string): Promise<AnalysisEnqueueResult>
  completeLocalAnalysis?(queueItemId: string, analysis: JobAnalysis): Promise<void>
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

function offerContent(offer: ImportedJobOffer) {
  return { title: offer.title, company: offer.company, location: offer.location ?? null, workMode: offer.workMode ?? null, contractType: offer.contractType ?? null, salary: offer.salary ?? null, sourceUrl: normalizeSourceUrl(offer.sourceUrl), sourceLabel: offer.sourceLabel ?? null, missingFields: offer.missingFields, warnings: offer.warnings }
}

export function buildImportIdempotencyKey(userId: string, report: ImportedReport, parserVersion = 'rocketjobs-parser-v1') {
  const payload = report.offers.map((offer) => ({ externalId: offer.id, content: offerContent(offer) })).sort((left, right) => left.externalId.localeCompare(right.externalId))
  return `workspace-${stableHash(`${userId}|${report.source}|${parserVersion}|${JSON.stringify(payload)}`)}`
}

export function toWorkspaceImportInput(userId: string, report: ImportedReport, parserVersion = 'rocketjobs-parser-v1'): WorkspaceImportInput {
  const items: WorkspaceImportItem[] = []
  const invalidItems: Array<{ rawExternalId: string; reason: string }> = []
  for (const offer of report.offers) {
    if (!offer.title.trim() || !offer.company.trim()) { invalidItems.push({ rawExternalId: offer.id, reason: 'Brak tytułu lub firmy.' }); continue }
    const data = offerContent(offer)
    items.push({ rawExternalId: offer.id, title: offer.title.trim(), company: offer.company.trim(), location: offer.location?.trim() || null, sourceUrl: offer.sourceUrl ?? null, normalizedSourceUrl: normalizeSourceUrl(offer.sourceUrl), canonicalFingerprint: buildCanonicalFingerprint({ sourceType: report.source, company: offer.company, title: offer.title, location: offer.location }), contentHash: stableHash(JSON.stringify(data)), offerData: data })
  }
  return { sourceType: report.source, fileName: report.fileName, importedAt: report.importedAt, parserVersion, idempotencyKey: buildImportIdempotencyKey(userId, report, parserVersion), items, invalidItems, warnings: report.warnings }
}

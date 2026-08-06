export const importSessionStatuses = ['active', 'partial', 'reverted'] as const
export const importOfferLinkMatchTypes = ['exact_url', 'canonical_high_confidence', 'possible_duplicate', 'new'] as const
export const offerLifecycleStatuses = ['new', 'needs_review', 'selected_for_analysis', 'analyzed', 'excluded'] as const
export const exclusionReasons = ['hard_filter_fail', 'user_decision', 'duplicate', 'expired', 'other'] as const
export const workspaceHardFilterStatuses = ['pass', 'needs_review', 'fail'] as const
export const analysisQueueStatuses = ['queued', 'processing', 'completed', 'failed', 'cancelled'] as const
export const analysisRequestTypes = ['initial', 'reanalysis'] as const
export const analysisRequestedBy = ['user', 'migration'] as const
export const analysisFreshnessStatuses = ['current', 'stale_profile', 'stale_offer', 'stale_algorithm', 'stale_prompt', 'stale_model', 'missing'] as const
export const workspaceMigrationRunStatuses = ['running', 'completed', 'failed', 'partial'] as const
export const workspaceMigrationAuditResults = ['migrated', 'merged_exact', 'possible_duplicate', 'orphan_offer', 'orphan_analysis', 'conflict'] as const
export const workspaceMigrationLegacyEntityTypes = ['offer', 'analysis', 'import', 'profile'] as const

export type ImportSessionStatus = (typeof importSessionStatuses)[number]
export type ImportOfferLinkMatchType = (typeof importOfferLinkMatchTypes)[number]
export type OfferLifecycleStatus = (typeof offerLifecycleStatuses)[number]
export type ExclusionReason = (typeof exclusionReasons)[number]
export type WorkspaceHardFilterStatus = (typeof workspaceHardFilterStatuses)[number]
export type AnalysisQueueStatus = (typeof analysisQueueStatuses)[number]
export type AnalysisRequestType = (typeof analysisRequestTypes)[number]
export type AnalysisRequestedBy = (typeof analysisRequestedBy)[number]
export type AnalysisFreshnessStatus = (typeof analysisFreshnessStatuses)[number]
export type WorkspaceMigrationRunStatus = (typeof workspaceMigrationRunStatuses)[number]
export type WorkspaceMigrationAuditResult = (typeof workspaceMigrationAuditResults)[number]
export type WorkspaceMigrationLegacyEntityType = (typeof workspaceMigrationLegacyEntityTypes)[number]

export type WorkspaceJson = Record<string, unknown>

export interface WorkspaceProfile {
  id: string
  userId: string
  profileData: WorkspaceJson
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface ProfileVersion {
  id: string
  userId: string
  profileId: string
  versionNumber: number
  profileData: WorkspaceJson
  contentHash: string
  createdAt: string
}

export interface CvSourceRecord {
  id: string
  userId: string
  profileVersionId: string | null
  sourceType: string
  fileName: string | null
  extractedTextHash: string | null
  metadata: WorkspaceJson
  createdAt: string
}

export interface WorkspaceImportSession {
  id: string
  userId: string
  sourceType: string
  sourceFilename: string
  status: ImportSessionStatus
  foundCount: number
  newCount: number
  duplicateCount: number
  invalidCount: number
  needsReviewCount: number
  warnings: unknown[]
  operationMetadata: WorkspaceJson
  createdAt: string
  revertedAt: string | null
  reactivatedAt: string | null
}

export interface WorkspaceJobOffer {
  id: string
  userId: string
  sourceType: string
  sourceUrl: string | null
  normalizedSourceUrl: string | null
  canonicalFingerprint: string | null
  title: string
  company: string
  location: string | null
  currentData: WorkspaceJson
  sourceData: WorkspaceJson | null
  firstSeenAt: string
  lastSeenAt: string
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface OfferVersion {
  id: string
  userId: string
  jobOfferId: string
  versionNumber: number
  offerData: WorkspaceJson
  contentHash: string
  sourceUrl: string | null
  observedAt: string
  importSessionId: string | null
  createdAt: string
}

export interface ImportOfferLink {
  id: string
  userId: string
  importSessionId: string
  jobOfferId: string
  offerVersionId: string | null
  matchType: ImportOfferLinkMatchType
  rawExternalId: string
  dedupEvidence: WorkspaceJson
  isNew: boolean
  isDuplicate: boolean
  needsReview: boolean
  createdAt: string
}

export interface OfferUserState {
  id: string
  userId: string
  jobOfferId: string
  lifecycleStatus: OfferLifecycleStatus
  favorite: boolean
  applied: boolean
  exclusionReason: ExclusionReason | null
  stateMetadata: WorkspaceJson
  excludedAt: string | null
  restoredAt: string | null
  lastViewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface HardFilterResultRecord {
  id: string
  userId: string
  jobOfferId: string
  offerVersionId: string
  profileVersionId: string
  status: WorkspaceHardFilterStatus
  reasons: unknown[]
  missingInformation: unknown[]
  checkedCriteria: unknown[]
  algorithmVersion: string
  createdAt: string
  isCurrent: boolean
}

export interface AnalysisQueueItem {
  id: string
  userId: string
  jobOfferId: string
  offerVersionId: string
  profileVersionId: string
  hardFilterResultId: string | null
  status: AnalysisQueueStatus
  requestType: AnalysisRequestType
  requestedBy: AnalysisRequestedBy
  attemptCount: number
  maxAttempts: number
  lockedAt: string | null
  leaseExpiresAt: string | null
  workerToken: string | null
  providerResponseId: string | null
  lastError: string | null
  queuedAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  updatedAt: string
}

export interface WorkspaceJobAnalysis {
  id: string
  userId: string
  jobOfferId: string
  latestVersionId: string | null
  createdAt: string
  updatedAt: string
}

export interface AnalysisVersion {
  id: string
  userId: string
  jobAnalysisId: string
  jobOfferId: string
  offerVersionId: string
  profileVersionId: string
  queueItemId: string | null
  analysisData: WorkspaceJson
  hardFilterStatus: string
  modelProvider: string
  modelVersion: string
  promptVersion: string | null
  algorithmVersion: string
  confidence: number | null
  coverage: number | null
  sourceType: string
  sourceQuality: string
  createdAt: string
}

export interface AnalysisEnqueueResult {
  queueItem: AnalysisQueueItem
  idempotent: boolean
}

export interface WorkspaceAnalysisState {
  queueItem: AnalysisQueueItem | null
  latestVersion: AnalysisVersion | null
  freshness: AnalysisFreshnessStatus
  lastAnalysisAt: string | null
  errorCode: string | null
  isLegacyFallback: boolean
}

export interface RecentlyViewed {
  userId: string
  jobOfferId: string
  viewedAt: string
}

export interface WorkspaceMigrationRun {
  id: string
  migrationKey: string
  status: WorkspaceMigrationRunStatus
  startedAt: string
  completedAt: string | null
  summary: WorkspaceJson
  lastError: string | null
}

export interface WorkspaceMigrationAudit {
  id: string
  migrationRunId: string
  userId: string | null
  legacyEntityType: WorkspaceMigrationLegacyEntityType
  legacyEntityId: string
  result: WorkspaceMigrationAuditResult
  targetEntityId: string | null
  details: WorkspaceJson
  createdAt: string
}

export interface DedupCandidate {
  id: string
  normalizedSourceUrl: string | null
  canonicalFingerprint: string | null
}

export interface DedupDecision {
  matchType: ImportOfferLinkMatchType
  targetOfferId: string | null
  candidateOfferIds: string[]
  isNew: boolean
  isDuplicate: boolean
  needsReview: boolean
}

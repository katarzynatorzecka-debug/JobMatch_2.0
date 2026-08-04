import { z } from 'zod'
import {
  analysisFreshnessStatuses,
  analysisQueueStatuses,
  analysisRequestedBy,
  analysisRequestTypes,
  exclusionReasons,
  importOfferLinkMatchTypes,
  importSessionStatuses,
  offerLifecycleStatuses,
  workspaceHardFilterStatuses,
  workspaceMigrationAuditResults,
  workspaceMigrationLegacyEntityTypes,
  workspaceMigrationRunStatuses,
} from '../contracts/workspace'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const jsonObject = z.record(z.string(), z.unknown())
const jsonArray = z.array(z.unknown())
const nullableTimestamp = timestamp.nullable()

export const importSessionStatusSchema = z.enum(importSessionStatuses)
export const importOfferLinkMatchTypeSchema = z.enum(importOfferLinkMatchTypes)
export const offerLifecycleStatusSchema = z.enum(offerLifecycleStatuses)
export const exclusionReasonSchema = z.enum(exclusionReasons)
export const workspaceHardFilterStatusSchema = z.enum(workspaceHardFilterStatuses)
export const analysisQueueStatusSchema = z.enum(analysisQueueStatuses)
export const analysisRequestTypeSchema = z.enum(analysisRequestTypes)
export const analysisRequestedBySchema = z.enum(analysisRequestedBy)
export const analysisFreshnessStatusSchema = z.enum(analysisFreshnessStatuses)
export const workspaceMigrationRunStatusSchema = z.enum(workspaceMigrationRunStatuses)
export const workspaceMigrationAuditResultSchema = z.enum(workspaceMigrationAuditResults)
export const workspaceMigrationLegacyEntityTypeSchema = z.enum(workspaceMigrationLegacyEntityTypes)

export const workspaceProfileSchema = z.object({
  id: uuid,
  userId: uuid,
  profileData: jsonObject,
  currentVersionId: uuid.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const profileVersionSchema = z.object({
  id: uuid,
  userId: uuid,
  profileId: uuid,
  versionNumber: z.number().int().positive(),
  profileData: jsonObject,
  contentHash: z.string().trim().min(1).max(128),
  createdAt: timestamp,
}).strict()

export const cvSourceSchema = z.object({
  id: uuid,
  userId: uuid,
  profileVersionId: uuid.nullable(),
  sourceType: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(260).nullable(),
  extractedTextHash: z.string().trim().min(1).max(128).nullable(),
  metadata: jsonObject,
  createdAt: timestamp,
}).strict()

export const workspaceImportSessionSchema = z.object({
  id: uuid,
  userId: uuid,
  sourceType: z.string().trim().min(1).max(80),
  sourceFilename: z.string().trim().min(1).max(260),
  status: importSessionStatusSchema,
  foundCount: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  invalidCount: z.number().int().nonnegative(),
  needsReviewCount: z.number().int().nonnegative(),
  warnings: jsonArray,
  operationMetadata: jsonObject,
  createdAt: timestamp,
  revertedAt: nullableTimestamp,
  reactivatedAt: nullableTimestamp,
}).strict()

export const workspaceJobOfferSchema = z.object({
  id: uuid,
  userId: uuid,
  sourceType: z.string().trim().min(1).max(80),
  sourceUrl: z.url().max(1400).nullable(),
  normalizedSourceUrl: z.url().max(1400).nullable(),
  canonicalFingerprint: z.string().trim().min(1).max(1000).nullable(),
  title: z.string().trim().min(1).max(180),
  company: z.string().trim().min(1).max(180),
  location: z.string().trim().min(1).max(180).nullable(),
  currentData: jsonObject,
  sourceData: jsonObject.nullable(),
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
  currentVersionId: uuid.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const offerVersionSchema = z.object({
  id: uuid,
  userId: uuid,
  jobOfferId: uuid,
  versionNumber: z.number().int().positive(),
  offerData: jsonObject,
  contentHash: z.string().trim().min(1).max(128),
  sourceUrl: z.url().max(1400).nullable(),
  observedAt: timestamp,
  importSessionId: uuid.nullable(),
  createdAt: timestamp,
}).strict()

export const importOfferLinkSchema = z.object({
  id: uuid,
  userId: uuid,
  importSessionId: uuid,
  jobOfferId: uuid,
  offerVersionId: uuid.nullable(),
  matchType: importOfferLinkMatchTypeSchema,
  rawExternalId: z.string().trim().min(1).max(180),
  dedupEvidence: jsonObject,
  isNew: z.boolean(),
  isDuplicate: z.boolean(),
  needsReview: z.boolean(),
  createdAt: timestamp,
}).strict()

export const offerUserStateSchema = z.object({
  id: uuid,
  userId: uuid,
  jobOfferId: uuid,
  lifecycleStatus: offerLifecycleStatusSchema,
  favorite: z.boolean(),
  applied: z.boolean(),
  exclusionReason: exclusionReasonSchema.nullable(),
  stateMetadata: jsonObject,
  excludedAt: nullableTimestamp,
  restoredAt: nullableTimestamp,
  lastViewedAt: nullableTimestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const hardFilterResultSchema = z.object({
  id: uuid,
  userId: uuid,
  jobOfferId: uuid,
  offerVersionId: uuid,
  profileVersionId: uuid,
  status: workspaceHardFilterStatusSchema,
  reasons: jsonArray,
  missingInformation: jsonArray,
  checkedCriteria: jsonArray,
  algorithmVersion: z.string().trim().min(1).max(120),
  createdAt: timestamp,
  isCurrent: z.boolean(),
}).strict()

export const analysisQueueItemSchema = z.object({
  id: uuid,
  userId: uuid,
  jobOfferId: uuid,
  offerVersionId: uuid,
  profileVersionId: uuid,
  hardFilterResultId: uuid.nullable(),
  status: analysisQueueStatusSchema,
  requestType: analysisRequestTypeSchema,
  requestedBy: analysisRequestedBySchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lockedAt: nullableTimestamp,
  leaseExpiresAt: nullableTimestamp,
  workerToken: z.string().trim().min(1).max(160).nullable(),
  lastError: z.string().trim().min(1).max(2000).nullable(),
  queuedAt: timestamp,
  startedAt: nullableTimestamp,
  completedAt: nullableTimestamp,
  cancelledAt: nullableTimestamp,
  updatedAt: timestamp,
}).strict().superRefine((value, context) => {
  if (value.attemptCount > value.maxAttempts) context.addIssue({ code: 'custom', message: 'attemptCount cannot exceed maxAttempts', path: ['attemptCount'] })
  if (value.status === 'processing' && (!value.lockedAt || !value.leaseExpiresAt || !value.workerToken)) {
    context.addIssue({ code: 'custom', message: 'processing queue items require a lease', path: ['status'] })
  }
})

export const workspaceJobAnalysisSchema = z.object({
  id: uuid,
  userId: uuid,
  jobOfferId: uuid,
  latestVersionId: uuid.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

export const analysisVersionSchema = z.object({
  id: uuid,
  userId: uuid,
  jobAnalysisId: uuid,
  jobOfferId: uuid,
  offerVersionId: uuid,
  profileVersionId: uuid,
  queueItemId: uuid.nullable(),
  analysisData: jsonObject,
  hardFilterStatus: z.string().trim().min(1).max(80),
  modelProvider: z.string().trim().min(1).max(80),
  modelVersion: z.string().trim().min(1).max(160),
  promptVersion: z.string().trim().min(1).max(160).nullable(),
  algorithmVersion: z.string().trim().min(1).max(160),
  confidence: z.number().min(0).max(100).nullable(),
  coverage: z.number().min(0).max(100).nullable(),
  sourceType: z.string().trim().min(1).max(80),
  sourceQuality: z.string().trim().min(1).max(80),
  createdAt: timestamp,
}).strict()

export const recentlyViewedSchema = z.object({ userId: uuid, jobOfferId: uuid, viewedAt: timestamp }).strict()

export const workspaceMigrationRunSchema = z.object({
  id: uuid,
  migrationKey: z.string().trim().min(1).max(160),
  status: workspaceMigrationRunStatusSchema,
  startedAt: timestamp,
  completedAt: nullableTimestamp,
  summary: jsonObject,
  lastError: z.string().trim().min(1).max(2000).nullable(),
}).strict()

export const workspaceMigrationAuditSchema = z.object({
  id: uuid,
  migrationRunId: uuid,
  userId: uuid.nullable(),
  legacyEntityType: workspaceMigrationLegacyEntityTypeSchema,
  legacyEntityId: z.string().trim().min(1).max(180),
  result: workspaceMigrationAuditResultSchema,
  targetEntityId: uuid.nullable(),
  details: jsonObject,
  createdAt: timestamp,
}).strict()

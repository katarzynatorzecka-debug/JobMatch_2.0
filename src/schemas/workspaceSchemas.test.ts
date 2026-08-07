import { describe, expect, it } from 'vitest'
import {
  analysisFreshnessStatusSchema,
  analysisQueueItemSchema,
  analysisVersionSchema,
  cvSourceSchema,
  exclusionReasonSchema,
  hardFilterBatchResultSchema,
  importOfferLinkSchema,
  offerLifecycleStatusSchema,
  workspaceMigrationAuditSchema,
} from './workspaceSchemas'

const id = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const createdAt = '2026-08-04T10:00:00.000Z'

describe('workspace schemas', () => {
  it('validates the strict hard filter batch RPC boundary', () => {
    const value = { profileVersionId: id, hardFilterResultIds: [otherId] }
    expect(hardFilterBatchResultSchema.safeParse(value).success).toBe(true)
    expect(hardFilterBatchResultSchema.safeParse({ ...value, hardFilterResultIds: 'invalid' }).success).toBe(false)
  })

  it('accepts a queue item with an active lease and valid attempts', () => {
    const result = analysisQueueItemSchema.safeParse({
      id,
      userId: otherId,
      jobOfferId: id,
      offerVersionId: id,
      profileVersionId: id,
      hardFilterResultId: null,
      status: 'processing',
      requestType: 'initial',
      requestedBy: 'user',
      attemptCount: 1,
      maxAttempts: 3,
      lockedAt: createdAt,
      leaseExpiresAt: '2026-08-04T10:05:00.000Z',
      workerToken: 'lease-token',
      providerResponseId: null,
      analysisIdentity: null,
      lastError: null,
      queuedAt: createdAt,
      startedAt: createdAt,
      completedAt: null,
      cancelledAt: null,
      updatedAt: createdAt,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid queue lease and attempts beyond the configured maximum', () => {
    const result = analysisQueueItemSchema.safeParse({
      id,
      userId: otherId,
      jobOfferId: id,
      offerVersionId: id,
      profileVersionId: id,
      hardFilterResultId: null,
      status: 'processing',
      requestType: 'initial',
      requestedBy: 'user',
      attemptCount: 4,
      maxAttempts: 3,
      lockedAt: null,
      leaseExpiresAt: null,
      workerToken: null,
      providerResponseId: null,
      analysisIdentity: null,
      lastError: null,
      queuedAt: createdAt,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      updatedAt: createdAt,
    })
    expect(result.success).toBe(false)
  })

  it.each(['lockedAt', 'leaseExpiresAt', 'workerToken'] as const)('rejects a processing queue item missing %s', (field) => {
    const value = {
      id, userId: otherId, jobOfferId: id, offerVersionId: id, profileVersionId: id, hardFilterResultId: null,
      status: 'processing', requestType: 'initial', requestedBy: 'user', attemptCount: 1, maxAttempts: 3,
      lockedAt: createdAt, leaseExpiresAt: createdAt, workerToken: 'lease-token', providerResponseId: null, analysisIdentity: null, lastError: null,
      queuedAt: createdAt, startedAt: createdAt, completedAt: null, cancelledAt: null, updatedAt: createdAt,
    }
    value[field] = null as never
    expect(analysisQueueItemSchema.safeParse(value).success).toBe(false)
  })

  it('accepts only explicit freshness statuses', () => {
    expect(analysisFreshnessStatusSchema.safeParse('stale_profile').success).toBe(true)
    expect(analysisFreshnessStatusSchema.safeParse('outdated').success).toBe(false)
  })

  it('validates link decisions that can be persisted in import_offer_links', () => {
    expect(importOfferLinkSchema.safeParse({
      id,
      userId: otherId,
      importSessionId: id,
      jobOfferId: id,
      offerVersionId: null,
      matchType: 'possible_duplicate',
      rawExternalId: 'rocketjobs-42',
      dedupEvidence: { candidateOfferIds: [otherId] },
      isNew: true,
      isDuplicate: false,
      needsReview: true,
      createdAt,
    }).success).toBe(true)
  })

  it('accepts only declared lifecycle and exclusion enums', () => {
    expect(offerLifecycleStatusSchema.safeParse('analyzed').success).toBe(true)
    expect(offerLifecycleStatusSchema.safeParse('archived').success).toBe(false)
    expect(exclusionReasonSchema.safeParse('other').success).toBe(true)
    expect(exclusionReasonSchema.safeParse('import_reverted').success).toBe(false)
  })

  it('rejects out-of-range confidence, coverage and unknown schema fields', () => {
    const base = {
      id, userId: otherId, jobAnalysisId: id, jobOfferId: id, offerVersionId: id, profileVersionId: id, queueItemId: null,
      analysisData: {}, hardFilterStatus: 'pass', modelProvider: 'openai', modelVersion: 'model', promptVersion: null,
      algorithmVersion: 'r1', confidence: 100, coverage: 0, sourceType: 'rocketjobs', sourceQuality: 'full', analysisIdentity: null, createdAt,
    }
    expect(analysisVersionSchema.safeParse({ ...base, confidence: 101 }).success).toBe(false)
    expect(analysisVersionSchema.safeParse({ ...base, coverage: -1 }).success).toBe(false)
    expect(analysisVersionSchema.safeParse({ ...base, undocumented: true }).success).toBe(false)
  })

  it('keeps cv source records metadata-only', () => {
    const base = { id, userId: otherId, profileVersionId: null, sourceType: 'manual', fileName: null, extractedTextHash: null, metadata: { origin: 'user' }, createdAt }
    expect(cvSourceSchema.safeParse(base).success).toBe(true)
    expect(cvSourceSchema.safeParse({ ...base, rawContent: 'private document' }).success).toBe(false)
  })

  it('validates migration audit categories and rejects undeclared outcomes', () => {
    const base = { id, migrationRunId: otherId, userId: null, legacyEntityType: 'analysis', legacyEntityId: 'legacy-analysis-42', targetEntityId: null, details: {}, createdAt }
    expect(workspaceMigrationAuditSchema.safeParse({ ...base, result: 'orphan_analysis' }).success).toBe(true)
    expect(workspaceMigrationAuditSchema.safeParse({ ...base, result: 'auto_merged' }).success).toBe(false)
  })
})

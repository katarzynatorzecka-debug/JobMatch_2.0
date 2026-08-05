import { describe, expect, it } from 'vitest'
import { WorkspaceRepositoryError } from './workspaceRpc'
import { mapHardFilter, mapState } from './supabaseWorkspaceRepository'

const id = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const createdAt = '2026-08-05T10:00:00.000Z'

describe('Supabase workspace row boundary', () => {
  it('maps a valid offer state through the Zod boundary', () => {
    expect(mapState({ id, user_id: otherId, job_offer_id: id, lifecycle_status: 'needs_review', favorite: true, applied: false, exclusion_reason: null, state_metadata: {}, excluded_at: null, restored_at: null, last_viewed_at: null, created_at: createdAt, updated_at: createdAt })).toMatchObject({ lifecycleStatus: 'needs_review', favorite: true })
  })

  it('rejects invalid lifecycle and hard-filter enums with a controlled domain code', () => {
    expect(() => mapState({ id, user_id: otherId, job_offer_id: id, lifecycle_status: 'legacy', favorite: false, applied: false, exclusion_reason: null, state_metadata: {}, excluded_at: null, restored_at: null, last_viewed_at: null, created_at: createdAt, updated_at: createdAt })).toThrow(WorkspaceRepositoryError)
    const invalidHardFilter = () => mapHardFilter({ id, user_id: otherId, job_offer_id: id, offer_version_id: id, profile_version_id: id, status: 'unknown', reasons: [], missing_information: [], checked_criteria: [], algorithm_version: 'hf-v1', created_at: createdAt, is_current: true })
    expect(invalidHardFilter).toThrow(WorkspaceRepositoryError)
    try { invalidHardFilter() } catch (error) { expect((error as WorkspaceRepositoryError).code).toBe('WORKSPACE_INVALID_RESPONSE') }
  })
})

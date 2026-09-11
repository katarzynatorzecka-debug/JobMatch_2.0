import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202608050900_workspace_analysis_queue.sql?raw'
import claimFixMigration from '../../../supabase/migrations/202608050930_workspace_analysis_queue_claim_fix.sql?raw'
import pgcryptoFixMigration from '../../../supabase/migrations/202608050940_workspace_analysis_queue_pgcrypto_fix.sql?raw'
import completeParameterFixMigration from '../../../supabase/migrations/202608050950_workspace_complete_analysis_parameter_fix.sql?raw'
import completeConflictFixMigration from '../../../supabase/migrations/202608050960_workspace_complete_analysis_conflict_fix.sql?raw'

describe('R1.5 analysis queue migration contract', () => {
  it('uses queue RPCs, leases and a per-queue version invariant', () => {
    expect(migration).toContain('workspace_enqueue_analysis')
    expect(migration).toContain('workspace_cancel_queued_analysis')
    expect(migration).toContain('workspace_claim_next_analysis')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('analysis_versions_one_per_queue_item')
    expect(migration).toContain("status in ('queued', 'processing')")
  })

  it('keeps client writes out of queue and version tables', () => {
    expect(migration).toContain('revoke insert, update, delete on public.analysis_queue from authenticated')
    expect(migration).toContain('WORKSPACE_WORKER_FORBIDDEN')
    expect(migration).toContain("current_filter.status = 'fail'")
    expect(migration).not.toMatch(/\b(drop\s+table|truncate\s+table)\b/i)
  })

  it('makes complete and fail controlled and idempotent', () => {
    expect(migration).toContain('workspace_complete_analysis')
    expect(migration).toContain('workspace_fail_analysis')
    expect(migration).toContain('WORKSPACE_ANALYSIS_STALE_WORKER')
    expect(migration).toContain('on conflict (queue_item_id) where queue_item_id is not null do nothing')
  })

  it('keeps the claim max-attempt condition independent from fail error codes', () => {
    const claimFunction = claimFixMigration.split('create or replace function public.workspace_fail_analysis')[0]

    expect(claimFunction).toContain('if item.attempt_count >= item.max_attempts then')
    expect(claimFunction).not.toContain('error_code')
    expect(claimFixMigration).toContain("error_code = 'ANALYSIS_PROVIDER_RECEIPT_SAVE_FAILED'")
  })

  it('uses the Supabase extensions schema when generating a lease worker token', () => {
    expect(pgcryptoFixMigration).toContain('extensions.gen_random_bytes(24)')
    expect(pgcryptoFixMigration).not.toContain('encode(gen_random_bytes(24)')
  })

  it('qualifies the complete-analysis parameter in version lookup', () => {
    expect(completeParameterFixMigration).toContain('v.queue_item_id = workspace_complete_analysis.queue_item_id')
    expect(completeParameterFixMigration).toContain('q.id = workspace_complete_analysis.queue_item_id')
  })

  it('keeps complete idempotent through the locked queue row and prior version lookup', () => {
    expect(completeConflictFixMigration).toContain('for update')
    expect(completeConflictFixMigration).toContain('if found then return jsonb_build_object')
    expect(completeConflictFixMigration).not.toContain('on conflict (queue_item_id)')
  })
})

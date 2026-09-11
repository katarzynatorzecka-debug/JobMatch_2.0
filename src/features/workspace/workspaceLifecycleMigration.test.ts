import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202608041400_workspace_lifecycle_and_hard_filter.sql?raw'
import correctionMigration from '../../../supabase/migrations/202608041500_workspace_hard_filter_corrections.sql?raw'

describe('R1.4 workspace lifecycle migration contract', () => {
  it('persists one current hard filter per offer and creates profile versions idempotently', () => {
    expect(migration).toContain('hard_filter_results_one_current_per_offer')
    expect(migration).toContain('workspace_persist_hard_filter_batch')
    expect(migration).toContain('profileHash')
    expect(migration).toContain('set is_current = false')
  })

  it('contains only lifecycle RPCs and no queue or destructive operations', () => {
    expect(migration).toContain('workspace_set_offer_favorite')
    expect(migration).toContain('workspace_restore_offer')
    expect(migration).toContain('workspace_mark_offer_viewed')
    expect(migration).not.toMatch(/\b(drop|truncate|delete)\b/i)
    expect(migration).not.toContain('analysis_queue')
  })

  it('serializes concurrent current-result writes and rejects duplicate offer IDs', () => {
    expect(correctionMigration).toContain('pg_advisory_xact_lock')
    expect(correctionMigration).toContain("order by value ->> 'jobOfferId'")
    expect(correctionMigration).toContain('WORKSPACE_DUPLICATE_HARD_FILTER_ITEM')
    expect(correctionMigration).toContain('set is_current = false')
  })

  it('recovers only a hard-filter exclusion when a newer result replaces it', () => {
    expect(correctionMigration).toContain("state_exclusion_reason = 'hard_filter_fail'")
    expect(correctionMigration).toContain("s.state_metadata - 'previousLifecycleStatus'")
    expect(correctionMigration).not.toContain('analysis_queue')
  })
})

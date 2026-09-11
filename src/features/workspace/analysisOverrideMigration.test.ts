import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202608061100_workspace_analysis_override.sql?raw'

describe('Hard Filter override migration', () => {
  it('adds only an explicit override RPC and keeps the default queue contract intact', () => {
    expect(migration).toContain('workspace_enqueue_analysis_override(offer_id uuid)')
    expect(migration).toContain("current_filter.status <> 'fail'")
    expect(migration).toContain("exclusion = 'user_decision'")
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('grant execute on function public.workspace_enqueue_analysis_override(uuid) to authenticated')
    expect(migration).not.toMatch(/\b(drop|truncate|delete|update)\b/i)
  })
})

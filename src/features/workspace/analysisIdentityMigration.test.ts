import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202608061200_analysis_identity_reuse.sql?raw'
import correction from '../../../supabase/migrations/202608061210_analysis_identity_enqueue_fix.sql?raw'
import completionCorrection from '../../../supabase/migrations/202608061220_analysis_completion_reuse_fix.sql?raw'

describe('analysis identity migration', () => {
  it('adds identity storage and a lookup index without destructive operations', () => {
    expect(migration).toContain('add column if not exists analysis_identity text')
    expect(migration).toContain('analysis_versions_identity_lookup_idx')
    expect(migration).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })

  it('reuses only a completed latest version with matching identity and provider receipt', () => {
    expect(migration).toContain('v.analysis_identity = analysis_identity')
    expect(migration).toContain("q.status = 'completed'")
    expect(migration).toContain('q.provider_response_id is not null')
    expect(migration).toContain("v.analysis_data ->> 'offerId' = p_offer_id::text")
  })

  it('keeps explicit reanalysis separate from ordinary replay', () => {
    expect(migration).toContain('workspace_reanalyze_analysis')
    expect(migration).toContain('p_force_reanalysis')
    expect(migration).toContain("'reanalysis'")
  })

  it('repairs the deployed identity name ambiguity without exposing the internal RPC', () => {
    expect(correction).toContain('v_analysis_identity text')
    expect(correction).toContain('v.analysis_identity = v_analysis_identity')
    expect(correction).toContain("current_filter.id, v_analysis_identity, 'queued'")
    expect(correction).toContain('revoke all on function public.workspace_enqueue_analysis_internal(uuid, boolean, boolean) from public')
    expect(correction).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })

  it('resumes a cached provider response without a new external attempt and completes without partial conflict inference', () => {
    expect(completionCorrection).toContain('item.attempt_count >= item.max_attempts and item.provider_response_id is null')
    expect(completionCorrection).toContain('case when item.provider_response_id is null then attempt_count + 1 else attempt_count end')
    expect(completionCorrection).toContain('analysis_identity, analysis_data')
    expect(completionCorrection).not.toContain('on conflict (queue_item_id) where queue_item_id is not null')
    expect(completionCorrection).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })
})

import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202608061200_analysis_identity_reuse.sql?raw'
import correction from '../../../supabase/migrations/202608061210_analysis_identity_enqueue_fix.sql?raw'
import completionCorrection from '../../../supabase/migrations/202608061220_analysis_completion_reuse_fix.sql?raw'
import replayAlignment from '../../../supabase/migrations/202608310900_analysis_identity_v2_replay_alignment.sql?raw'
import contractSnapshot from '../../../supabase/migrations/202608310910_offer_analysis_contract_snapshot.sql?raw'
import reuseVersionGuard from '../../../supabase/migrations/202609011345_analysis_reuse_version_guard.sql?raw'
import contractIdentityR7 from '../../../supabase/migrations/20260901143852_analysis_contract_identity_r7.sql?raw'

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

  it('aligns ordinary replay with the current v2 prompt and r5 deterministic scorer', () => {
    expect(replayAlignment).toContain("'jobmatch-job-match-v2', 'gpt-5.4-mini', 'jobmatch-deterministic-r6'")
    expect(replayAlignment).toContain('v.analysis_identity = v_analysis_identity')
    expect(replayAlignment).toContain("'reused', true")
    expect(replayAlignment).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })

  it('adds a non-destructive public-offer snapshot and criteria contract per offer version', () => {
    expect(contractSnapshot).toContain('add column if not exists analysis_source_snapshot jsonb')
    expect(contractSnapshot).toContain('add column if not exists analysis_criteria_manifest jsonb')
    expect(contractSnapshot).toContain('offer_versions_analysis_contract_lookup_idx')
    expect(contractSnapshot).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })

  it('does not reuse an older persisted scorer under a newer identity contract', () => {
    expect(reuseVersionGuard).toContain("v.prompt_version = 'jobmatch-job-match-v2'")
    expect(reuseVersionGuard).toContain("v.model_version = 'gpt-5.4-mini'")
    expect(reuseVersionGuard).toContain("v.algorithm_version = 'jobmatch-deterministic-r6'")
    expect(reuseVersionGuard).toContain('v.analysis_identity = v_analysis_identity')
    expect(reuseVersionGuard).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })

  it('binds r7 replay identity to the persisted source-and-manifest hash without altering history', () => {
    expect(contractIdentityR7).toContain('add column if not exists analysis_contract_hash text')
    expect(contractIdentityR7).toContain("'jobmatch-job-match-v3', 'gpt-5.4-mini', 'jobmatch-deterministic-r7:' || coalesce(v_contract_hash, 'pending')")
    expect(contractIdentityR7).toContain("v.algorithm_version = 'jobmatch-deterministic-r7'")
    expect(contractIdentityR7).toContain('v_contract_hash is not null')
    expect(contractIdentityR7).toContain('revoke all on function public.workspace_enqueue_analysis_internal(uuid, boolean, boolean) from public, anon, authenticated, service_role')
    expect(contractIdentityR7).not.toMatch(/\b(drop|truncate|delete)\b/i)
  })
})

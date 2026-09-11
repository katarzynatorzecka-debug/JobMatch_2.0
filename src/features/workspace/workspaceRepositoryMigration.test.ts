import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202608041200_workspace_repository_imports.sql?raw'
import correction from '../../../supabase/migrations/202608041300_workspace_repository_imports_corrections.sql?raw'

describe('R1.2/R1.3 workspace repository migration contract', () => {
  it('keeps a per-user idempotency guard and an atomic import RPC', () => {
    expect(migration).toContain('import_sessions_user_idempotency_key_unique')
    expect(migration).toContain('create or replace function public.workspace_import_report(payload jsonb)')
    expect(migration).toContain('security invoker')
  })

  it('records exact reuse and possible duplicates without unsafe automatic merging', () => {
    expect(migration).toContain("match_kind := 'exact_url'")
    expect(migration).toContain("match_kind := 'possible_duplicate'")
    expect(migration).toContain("match_kind in ('new', 'possible_duplicate')")
  })

  it('uses explicitly named counters rather than ambiguous column assignments', () => {
    expect(migration).toContain('v_new_count integer := 0')
    expect(migration).toContain('new_count = v_new_count')
    expect(migration).not.toContain('new_count = new_count')
    expect(migration).not.toContain('duplicate_count = duplicate_count')
  })

  it('contains no destructive data operations and exposes revert and reactivate procedures', () => {
    expect(migration).not.toMatch(/\b(delete|truncate|drop)\b/i)
    expect(migration).toContain('public.workspace_revert_import')
    expect(migration).toContain('public.workspace_reactivate_import')
  })

  it('uses conflict-safe idempotency and restores partial status only when appropriate', () => {
    expect(correction).toContain('on conflict (user_id, import_idempotency_key) where import_idempotency_key is not null do nothing')
    expect(correction).toContain("case when s.invalid_count > 0 then 'partial' else 'active' end")
    expect(correction).toContain("status in ('active', 'partial')")
  })

  it('keeps repeated transitions idempotent without appending new links or versions', () => {
    expect(correction).toContain("and s.status <> 'reverted'")
    expect(correction).toContain("and s.status = 'reverted'")
    const reactivationProcedure = correction.slice(correction.indexOf('create or replace function public.workspace_reactivate_import'))
    expect(reactivationProcedure).not.toMatch(/insert into public\.(offer_versions|import_offer_links)/i)
  })
})

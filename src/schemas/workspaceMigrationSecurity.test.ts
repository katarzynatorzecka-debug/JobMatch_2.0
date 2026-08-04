import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20260804_workspace_foundation.sql?raw'

describe('R1.1 workspace migration security contract', () => {
  it('declares composite tenant foreign keys for the workspace relation graph', () => {
    expect(migration).toContain('foreign key (job_offer_id, user_id) references public.job_offers(id, user_id)')
    expect(migration).toContain('foreign key (profile_version_id, user_id) references public.profile_versions(id, user_id)')
    expect(migration).toContain('foreign key (import_session_id, user_id) references public.import_sessions(id, user_id)')
    expect(migration).toContain('foreign key (job_analysis_id, user_id) references public.workspace_job_analyses(id, user_id)')
    expect(migration).toContain('foreign key (queue_item_id, user_id) references public.analysis_queue(id, user_id)')
  })

  it('uses a canonical workspace analysis table instead of the legacy text-keyed table', () => {
    expect(migration).toContain('create table if not exists public.workspace_job_analyses')
    expect(migration).toContain('job_analysis_id uuid not null references public.workspace_job_analyses(id)')
    expect(migration).not.toContain('job_analysis_id uuid not null references public.job_analyses(id)')
  })

  it('keeps migration audit append-only for authenticated clients', () => {
    expect(migration).toContain('workspace_migration_audit_select_own')
    expect(migration).not.toContain('workspace_migration_audit_insert_own')
    expect(migration).not.toContain('workspace_migration_audit_update_own')
    expect(migration).not.toContain('workspace_migration_audit_delete_own')
  })

  it('defines URL uniqueness per user, a non-unique fingerprint, and an active-only queue invariant', () => {
    expect(migration).toContain('on public.job_offers (user_id, normalized_source_url)')
    expect(migration).toContain('where normalized_source_url is not null')
    expect(migration).toContain('on public.job_offers (user_id, canonical_fingerprint)')
    expect(migration).not.toMatch(/unique index[^;]*canonical_fingerprint/i)
    expect(migration).toContain("where status in ('queued', 'processing')")
  })

  it('guards policy creation against a controlled rerun after partial application', () => {
    expect(migration).toContain("from pg_policies where schemaname = 'public'")
    expect(migration).toContain("foreach action_name in array array['select', 'insert', 'update', 'delete']")
  })

  it('sets only the nullable id to null when an optional composite parent is deleted', () => {
    const guardedRelations = [
      ['profiles_current_version_user_fkey', 'current_version_id'],
      ['job_offers_current_version_user_fkey', 'current_version_id'],
      ['cv_sources_profile_version_user_fkey', 'profile_version_id'],
      ['offer_versions_import_user_fkey', 'import_session_id'],
      ['import_offer_links_version_user_fkey', 'offer_version_id'],
      ['analysis_queue_filter_user_fkey', 'hard_filter_result_id'],
      ['analysis_versions_queue_user_fkey', 'queue_item_id'],
      ['workspace_analyses_latest_version_user_fkey', 'latest_version_id'],
    ]

    for (const [constraint, nullableId] of guardedRelations) {
      expect(migration).toMatch(new RegExp(`${constraint}[\\s\\S]*?on delete set null \\(${nullableId}\\);`))
      expect(migration).not.toMatch(new RegExp(`${constraint}[\\s\\S]*?on delete set null;`))
    }
  })
})

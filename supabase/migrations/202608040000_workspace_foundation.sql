-- R1.1 Workspace Foundation. Additive only: legacy rows and columns remain untouched.
-- This migration creates schema contracts and audit structures; it deliberately performs no legacy backfill.
-- Legacy job_offers.import_session_id remains a compatibility link to the first import.
-- R1.3 must not delete import sessions and must decide the final canonical-offer migration strategy before import merge runtime.

alter table public.profiles add column if not exists current_version_id uuid;

alter table public.import_sessions
  add column if not exists status text not null default 'active' check (status in ('active', 'partial', 'reverted')),
  add column if not exists found_count integer not null default 0 check (found_count >= 0),
  add column if not exists new_count integer not null default 0 check (new_count >= 0),
  add column if not exists duplicate_count integer not null default 0 check (duplicate_count >= 0),
  add column if not exists invalid_count integer not null default 0 check (invalid_count >= 0),
  add column if not exists needs_review_count integer not null default 0 check (needs_review_count >= 0),
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists operation_metadata jsonb not null default '{}'::jsonb,
  add column if not exists reverted_at timestamptz,
  add column if not exists reactivated_at timestamptz;

alter table public.job_offers
  add column if not exists source_type text,
  add column if not exists source_url text,
  add column if not exists normalized_source_url text,
  add column if not exists canonical_fingerprint text,
  add column if not exists location text,
  add column if not exists current_data jsonb,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists current_version_id uuid,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.profile_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  profile_data jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (profile_id, version_number)
);

create table if not exists public.cv_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_version_id uuid references public.profile_versions(id) on delete set null,
  source_type text not null,
  file_name text,
  extracted_text_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.offer_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  offer_data jsonb not null,
  content_hash text not null,
  source_url text,
  observed_at timestamptz not null,
  import_session_id uuid references public.import_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (job_offer_id, version_number)
);

create table if not exists public.import_offer_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_session_id uuid not null references public.import_sessions(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete restrict,
  offer_version_id uuid references public.offer_versions(id) on delete set null,
  match_type text not null check (match_type in ('exact_url', 'canonical_high_confidence', 'possible_duplicate', 'new')),
  raw_external_id text not null,
  dedup_evidence jsonb not null default '{}'::jsonb,
  is_new boolean not null,
  is_duplicate boolean not null,
  needs_review boolean not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (import_session_id, raw_external_id),
  check (
    (match_type = 'new' and is_new and not is_duplicate and not needs_review)
    or (match_type in ('exact_url', 'canonical_high_confidence') and not is_new and is_duplicate and not needs_review)
    or (match_type = 'possible_duplicate' and is_new and not is_duplicate and needs_review)
  )
);

create table if not exists public.offer_user_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  lifecycle_status text not null default 'new' check (lifecycle_status in ('new', 'needs_review', 'selected_for_analysis', 'analyzed', 'excluded')),
  favorite boolean not null default false,
  applied boolean not null default false,
  exclusion_reason text check (exclusion_reason in ('hard_filter_fail', 'user_decision', 'duplicate', 'expired', 'other')),
  state_metadata jsonb not null default '{}'::jsonb,
  excluded_at timestamptz,
  restored_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, job_offer_id)
);

create table if not exists public.hard_filter_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  profile_version_id uuid not null references public.profile_versions(id) on delete cascade,
  status text not null check (status in ('pass', 'needs_review', 'fail')),
  reasons jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  checked_criteria jsonb not null default '[]'::jsonb,
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  is_current boolean not null default true,
  unique (id, user_id)
);

create table if not exists public.analysis_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  profile_version_id uuid not null references public.profile_versions(id) on delete cascade,
  hard_filter_result_id uuid references public.hard_filter_results(id) on delete set null,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  request_type text not null check (request_type in ('initial', 'reanalysis')),
  requested_by text not null check (requested_by in ('user', 'migration')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  worker_token text,
  last_error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (attempt_count <= max_attempts),
  check (status <> 'processing' or (locked_at is not null and lease_expires_at is not null and worker_token is not null)),
  unique (id, user_id)
);

create table if not exists public.workspace_job_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  latest_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, job_offer_id)
);

create table if not exists public.analysis_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_analysis_id uuid not null references public.workspace_job_analyses(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  offer_version_id uuid not null references public.offer_versions(id) on delete cascade,
  profile_version_id uuid not null references public.profile_versions(id) on delete cascade,
  queue_item_id uuid references public.analysis_queue(id) on delete set null,
  analysis_data jsonb not null,
  hard_filter_status text not null,
  model_provider text not null,
  model_version text not null,
  prompt_version text,
  algorithm_version text not null,
  confidence numeric check (confidence between 0 and 100),
  coverage numeric check (coverage between 0 and 100),
  source_type text not null,
  source_quality text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.recently_viewed (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_offer_id uuid not null references public.job_offers(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, job_offer_id)
);

create table if not exists public.workspace_migration_runs (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  status text not null check (status in ('running', 'completed', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  last_error text
);

create table if not exists public.workspace_migration_audit (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null references public.workspace_migration_runs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  legacy_entity_type text not null check (legacy_entity_type in ('offer', 'analysis', 'import', 'profile')),
  legacy_entity_id text not null,
  result text not null check (result in ('migrated', 'merged_exact', 'possible_duplicate', 'orphan_offer', 'orphan_analysis', 'conflict')),
  target_entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_id_user_id_unique on public.profiles (id, user_id);
create unique index if not exists import_sessions_id_user_id_unique on public.import_sessions (id, user_id);
create unique index if not exists job_offers_id_user_id_unique on public.job_offers (id, user_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_current_version_user_fkey') then
    alter table public.profiles add constraint profiles_current_version_user_fkey foreign key (current_version_id, user_id) references public.profile_versions(id, user_id) on delete set null (current_version_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_offers_current_version_user_fkey') then
    alter table public.job_offers add constraint job_offers_current_version_user_fkey foreign key (current_version_id, user_id) references public.offer_versions(id, user_id) on delete set null (current_version_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_offers_import_user_fkey') then
    alter table public.job_offers add constraint job_offers_import_user_fkey foreign key (import_session_id, user_id) references public.import_sessions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profile_versions_profile_user_fkey') then
    alter table public.profile_versions add constraint profile_versions_profile_user_fkey foreign key (profile_id, user_id) references public.profiles(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cv_sources_profile_version_user_fkey') then
    alter table public.cv_sources add constraint cv_sources_profile_version_user_fkey foreign key (profile_version_id, user_id) references public.profile_versions(id, user_id) on delete set null (profile_version_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offer_versions_offer_user_fkey') then
    alter table public.offer_versions add constraint offer_versions_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offer_versions_import_user_fkey') then
    alter table public.offer_versions add constraint offer_versions_import_user_fkey foreign key (import_session_id, user_id) references public.import_sessions(id, user_id) on delete set null (import_session_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_offer_links_import_user_fkey') then
    alter table public.import_offer_links add constraint import_offer_links_import_user_fkey foreign key (import_session_id, user_id) references public.import_sessions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_offer_links_offer_user_fkey') then
    alter table public.import_offer_links add constraint import_offer_links_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'import_offer_links_version_user_fkey') then
    alter table public.import_offer_links add constraint import_offer_links_version_user_fkey foreign key (offer_version_id, user_id) references public.offer_versions(id, user_id) on delete set null (offer_version_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offer_user_state_offer_user_fkey') then
    alter table public.offer_user_state add constraint offer_user_state_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hard_filter_results_offer_user_fkey') then
    alter table public.hard_filter_results add constraint hard_filter_results_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hard_filter_results_version_user_fkey') then
    alter table public.hard_filter_results add constraint hard_filter_results_version_user_fkey foreign key (offer_version_id, user_id) references public.offer_versions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hard_filter_results_profile_user_fkey') then
    alter table public.hard_filter_results add constraint hard_filter_results_profile_user_fkey foreign key (profile_version_id, user_id) references public.profile_versions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_queue_offer_user_fkey') then
    alter table public.analysis_queue add constraint analysis_queue_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_queue_version_user_fkey') then
    alter table public.analysis_queue add constraint analysis_queue_version_user_fkey foreign key (offer_version_id, user_id) references public.offer_versions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_queue_profile_user_fkey') then
    alter table public.analysis_queue add constraint analysis_queue_profile_user_fkey foreign key (profile_version_id, user_id) references public.profile_versions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_queue_filter_user_fkey') then
    alter table public.analysis_queue add constraint analysis_queue_filter_user_fkey foreign key (hard_filter_result_id, user_id) references public.hard_filter_results(id, user_id) on delete set null (hard_filter_result_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_analyses_offer_user_fkey') then
    alter table public.workspace_job_analyses add constraint workspace_analyses_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_versions_analysis_user_fkey') then
    alter table public.analysis_versions add constraint analysis_versions_analysis_user_fkey foreign key (job_analysis_id, user_id) references public.workspace_job_analyses(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_versions_offer_user_fkey') then
    alter table public.analysis_versions add constraint analysis_versions_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_versions_version_user_fkey') then
    alter table public.analysis_versions add constraint analysis_versions_version_user_fkey foreign key (offer_version_id, user_id) references public.offer_versions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_versions_profile_user_fkey') then
    alter table public.analysis_versions add constraint analysis_versions_profile_user_fkey foreign key (profile_version_id, user_id) references public.profile_versions(id, user_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analysis_versions_queue_user_fkey') then
    alter table public.analysis_versions add constraint analysis_versions_queue_user_fkey foreign key (queue_item_id, user_id) references public.analysis_queue(id, user_id) on delete set null (queue_item_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_analyses_latest_version_user_fkey') then
    alter table public.workspace_job_analyses add constraint workspace_analyses_latest_version_user_fkey foreign key (latest_version_id, user_id) references public.analysis_versions(id, user_id) on delete set null (latest_version_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recently_viewed_offer_user_fkey') then
    alter table public.recently_viewed add constraint recently_viewed_offer_user_fkey foreign key (job_offer_id, user_id) references public.job_offers(id, user_id) on delete cascade;
  end if;
end $$;

create unique index if not exists job_offers_user_normalized_source_url_unique
  on public.job_offers (user_id, normalized_source_url)
  where normalized_source_url is not null;
create index if not exists job_offers_user_canonical_fingerprint_idx on public.job_offers (user_id, canonical_fingerprint);
create index if not exists profile_versions_user_profile_idx on public.profile_versions (user_id, profile_id, version_number desc);
create index if not exists cv_sources_user_profile_version_idx on public.cv_sources (user_id, profile_version_id);
create index if not exists import_sessions_user_created_idx on public.import_sessions (user_id, created_at desc);
create index if not exists offer_versions_user_offer_idx on public.offer_versions (user_id, job_offer_id, version_number desc);
create index if not exists import_offer_links_user_import_idx on public.import_offer_links (user_id, import_session_id);
create index if not exists import_offer_links_user_offer_idx on public.import_offer_links (user_id, job_offer_id);
create index if not exists offer_user_state_user_lifecycle_idx on public.offer_user_state (user_id, lifecycle_status);
create index if not exists hard_filter_results_user_offer_idx on public.hard_filter_results (user_id, job_offer_id, created_at desc);
create index if not exists analysis_queue_claim_idx on public.analysis_queue (status, lease_expires_at, queued_at);
create unique index if not exists analysis_queue_one_active_request_unique
  on public.analysis_queue (user_id, job_offer_id, profile_version_id, offer_version_id, request_type)
  where status in ('queued', 'processing');
create index if not exists analysis_versions_user_offer_idx on public.analysis_versions (user_id, job_offer_id, created_at desc);
create index if not exists recently_viewed_user_viewed_idx on public.recently_viewed (user_id, viewed_at desc);
create index if not exists workspace_migration_audit_run_idx on public.workspace_migration_audit (migration_run_id, created_at);
create index if not exists workspace_migration_audit_user_result_idx on public.workspace_migration_audit (user_id, result);

alter table public.profile_versions enable row level security;
alter table public.cv_sources enable row level security;
alter table public.offer_versions enable row level security;
alter table public.import_offer_links enable row level security;
alter table public.offer_user_state enable row level security;
alter table public.hard_filter_results enable row level security;
alter table public.analysis_queue enable row level security;
alter table public.workspace_job_analyses enable row level security;
alter table public.analysis_versions enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.workspace_migration_runs enable row level security;
alter table public.workspace_migration_audit enable row level security;

do $$
declare
  table_name text;
  action_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'profile_versions', 'cv_sources', 'offer_versions', 'import_offer_links',
    'offer_user_state', 'hard_filter_results', 'analysis_queue',
    'workspace_job_analyses', 'analysis_versions', 'recently_viewed'
  ] loop
    foreach action_name in array array['select', 'insert', 'update', 'delete'] loop
      policy_name := table_name || '_' || action_name || '_own';
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = policy_name) then
        if action_name = 'select' then
          execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', policy_name, table_name);
        elsif action_name = 'insert' then
          execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', policy_name, table_name);
        elsif action_name = 'update' then
          execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', policy_name, table_name);
        else
          execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', policy_name, table_name);
        end if;
      end if;
    end loop;
  end loop;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspace_migration_audit' and policyname = 'workspace_migration_audit_select_own') then
    execute 'create policy "workspace_migration_audit_select_own" on public.workspace_migration_audit for select to authenticated using ((select auth.uid()) = user_id)';
  end if;
end $$;

comment on table public.cv_sources is 'R1 metadata and hashes only. Raw CV content and storage references are intentionally excluded.';
comment on table public.workspace_job_analyses is 'Canonical workspace analysis pointer. Legacy public.job_analyses remains unchanged for compatibility.';
comment on table public.workspace_migration_runs is 'Idempotency marker for a later explicit legacy backfill. R1.1 does not execute backfill.';
comment on table public.workspace_migration_audit is 'Append-only evidence for explicit legacy migration outcomes; ambiguous analyses must remain orphaned or conflicted.';

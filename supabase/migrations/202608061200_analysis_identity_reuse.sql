-- Recovery V2 Phase 4: stable analysis identity and completed-result reuse.
-- Additive only. Existing versions remain historical and are never rewritten.

alter table public.analysis_queue add column if not exists analysis_identity text;
alter table public.analysis_versions add column if not exists analysis_identity text;

create index if not exists analysis_versions_identity_lookup_idx
  on public.analysis_versions (user_id, analysis_identity, created_at desc)
  where analysis_identity is not null;
create index if not exists analysis_queue_identity_lookup_idx
  on public.analysis_queue (user_id, analysis_identity, status, queued_at desc)
  where analysis_identity is not null;

create or replace function public.workspace_analysis_identity(
  p_user_id uuid,
  p_job_offer_id uuid,
  p_offer_version_id uuid,
  p_profile_version_id uuid,
  p_prompt_version text,
  p_model_version text,
  p_algorithm_version text
) returns text language sql immutable as $$
  select encode(extensions.digest(concat_ws('|', p_user_id::text, p_job_offer_id::text, p_offer_version_id::text, p_profile_version_id::text, p_prompt_version, p_model_version, p_algorithm_version), 'sha256'), 'hex')
$$;

create or replace function public.workspace_enqueue_analysis_internal(
  p_offer_id uuid,
  p_allow_hard_filter_fail boolean,
  p_force_reanalysis boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  current_profile_version_id uuid;
  current_offer_version_id uuid;
  current_filter public.hard_filter_results%rowtype;
  active_item public.analysis_queue%rowtype;
  reusable_item public.analysis_queue%rowtype;
  created_item public.analysis_queue%rowtype;
  analysis_identity text;
  exclusion text;
  has_analysis boolean := false;
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  select p.current_version_id into current_profile_version_id from public.profiles p where p.user_id = actor_id;
  if current_profile_version_id is null then raise exception 'WORKSPACE_PROFILE_VERSION_REQUIRED'; end if;
  select o.current_version_id into current_offer_version_id from public.job_offers o where o.id = p_offer_id and o.user_id = actor_id;
  if current_offer_version_id is null then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if;
  analysis_identity := public.workspace_analysis_identity(actor_id, p_offer_id, current_offer_version_id, current_profile_version_id, 'jobmatch-job-match-v1', 'gpt-5.4-mini', 'jobmatch-deterministic-r1');
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || analysis_identity, 0));
  select * into current_filter from public.hard_filter_results h where h.user_id = actor_id and h.job_offer_id = p_offer_id and h.is_current order by h.created_at desc limit 1;
  if not found then raise exception 'WORKSPACE_HARD_FILTER_REQUIRED'; end if;
  if current_filter.status = 'fail' and not p_allow_hard_filter_fail then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_HARD_FILTER'; end if;
  select exclusion_reason into exclusion from public.offer_user_state where user_id = actor_id and job_offer_id = p_offer_id;
  if exclusion = 'user_decision' then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_EXCLUSION'; end if;
  select * into active_item from public.analysis_queue q where q.user_id = actor_id and q.job_offer_id = p_offer_id and q.status in ('queued', 'processing') order by q.queued_at desc limit 1;
  if found then return jsonb_build_object('queueItem', to_jsonb(active_item), 'idempotent', true, 'reused', false); end if;
  if not p_force_reanalysis then
    select q.* into reusable_item
    from public.analysis_versions v
    join public.workspace_job_analyses a on a.id = v.job_analysis_id and a.user_id = v.user_id and a.latest_version_id = v.id
    join public.analysis_queue q on q.id = v.queue_item_id and q.user_id = v.user_id
    where v.user_id = actor_id and v.job_offer_id = p_offer_id and v.offer_version_id = current_offer_version_id
      and v.profile_version_id = current_profile_version_id and v.analysis_identity = analysis_identity
      and q.status = 'completed' and q.provider_response_id is not null
      and jsonb_typeof(v.analysis_data) = 'object' and v.analysis_data ->> 'offerId' = p_offer_id::text
    order by v.created_at desc limit 1;
    if found then return jsonb_build_object('queueItem', to_jsonb(reusable_item), 'idempotent', true, 'reused', true); end if;
  end if;
  select exists(select 1 from public.workspace_job_analyses a where a.user_id = actor_id and a.job_offer_id = p_offer_id and a.latest_version_id is not null) into has_analysis;
  insert into public.analysis_queue (user_id, job_offer_id, offer_version_id, profile_version_id, hard_filter_result_id, analysis_identity, status, request_type, requested_by, max_attempts)
  values (actor_id, p_offer_id, current_offer_version_id, current_profile_version_id, current_filter.id, analysis_identity, 'queued', case when p_force_reanalysis or has_analysis then 'reanalysis' else 'initial' end, 'user', 2)
  returning * into created_item;
  insert into public.offer_user_state (user_id, job_offer_id, lifecycle_status, favorite, applied, state_metadata)
  values (actor_id, p_offer_id, 'selected_for_analysis', false, false, '{}'::jsonb)
  on conflict (user_id, job_offer_id) do update set lifecycle_status = case when public.offer_user_state.exclusion_reason = 'user_decision' then public.offer_user_state.lifecycle_status else 'selected_for_analysis' end, updated_at = now();
  return jsonb_build_object('queueItem', to_jsonb(created_item), 'idempotent', false, 'reused', false);
end;
$$;

create or replace function public.workspace_enqueue_analysis(offer_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.workspace_enqueue_analysis_internal(offer_id, false, false)
$$;

create or replace function public.workspace_enqueue_analysis_override(offer_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.workspace_enqueue_analysis_internal(offer_id, true, false)
$$;

create or replace function public.workspace_reanalyze_analysis(offer_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.workspace_enqueue_analysis_internal(offer_id, false, true)
$$;

create or replace function public.workspace_complete_analysis(queue_item_id uuid, worker_token text, analysis_data jsonb, model_version text, prompt_version text, algorithm_version text, source_quality text, provider_request_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.analysis_queue%rowtype;
  analysis_id uuid;
  version_row public.analysis_versions%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select * into item from public.analysis_queue q where q.id = workspace_complete_analysis.queue_item_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  select * into version_row from public.analysis_versions v where v.queue_item_id = workspace_complete_analysis.queue_item_id limit 1;
  if found then return jsonb_build_object('analysisVersion', to_jsonb(version_row), 'idempotent', true); end if;
  if item.status <> 'processing' or item.worker_token is distinct from worker_token or item.lease_expires_at <= now() then raise exception 'WORKSPACE_ANALYSIS_STALE_WORKER'; end if;
  if jsonb_typeof(analysis_data) <> 'object' or analysis_data ->> 'offerId' <> item.job_offer_id::text then raise exception 'WORKSPACE_ANALYSIS_INVALID_RESULT'; end if;
  insert into public.workspace_job_analyses (user_id, job_offer_id) values (item.user_id, item.job_offer_id)
  on conflict (user_id, job_offer_id) do update set updated_at = now() returning id into analysis_id;
  insert into public.analysis_versions (user_id, job_analysis_id, job_offer_id, offer_version_id, profile_version_id, queue_item_id, analysis_identity, analysis_data, hard_filter_status, model_provider, model_version, prompt_version, algorithm_version, confidence, coverage, source_type, source_quality)
  values (item.user_id, analysis_id, item.job_offer_id, item.offer_version_id, item.profile_version_id, item.id, item.analysis_identity, analysis_data, coalesce(analysis_data ->> 'hardFilterStatus', 'pass'), 'openai', model_version, nullif(prompt_version, ''), algorithm_version, null, null, 'edge_function', source_quality)
  on conflict (queue_item_id) where queue_item_id is not null do nothing returning * into version_row;
  if version_row.id is null then select * into version_row from public.analysis_versions v where v.queue_item_id = item.id; end if;
  update public.workspace_job_analyses set latest_version_id = version_row.id, updated_at = now() where id = analysis_id and user_id = item.user_id;
  update public.analysis_queue set status = 'completed', completed_at = now(), worker_token = null, locked_at = null, lease_expires_at = null, last_error = null, updated_at = now() where id = item.id;
  update public.offer_user_state s set lifecycle_status = 'analyzed', updated_at = now() where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded' and not exists (select 1 from public.hard_filter_results h where h.user_id = item.user_id and h.job_offer_id = item.job_offer_id and h.is_current and h.status = 'fail');
  return jsonb_build_object('analysisVersion', to_jsonb(version_row), 'idempotent', false, 'providerRequestId', provider_request_id);
end;
$$;

revoke all on function public.workspace_reanalyze_analysis(uuid) from public;
grant execute on function public.workspace_reanalyze_analysis(uuid) to authenticated;

-- Failed queued attempts must not block a fresh reanalysis with the same scoring identity.
-- A retained provider receipt belongs to the failed attempt and must not be reused
-- after the request contract or structured-output schema changes.

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
  v_analysis_identity text;
  v_contract_hash text;
  exclusion text;
  has_analysis boolean := false;
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  select p.current_version_id into current_profile_version_id from public.profiles p where p.user_id = actor_id;
  if current_profile_version_id is null then raise exception 'WORKSPACE_PROFILE_VERSION_REQUIRED'; end if;
  select o.current_version_id into current_offer_version_id from public.job_offers o where o.id = p_offer_id and o.user_id = actor_id;
  if current_offer_version_id is null then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if;
  select ov.analysis_contract_hash into v_contract_hash from public.offer_versions ov where ov.id = current_offer_version_id and ov.user_id = actor_id;
  v_analysis_identity := public.workspace_analysis_identity(actor_id, p_offer_id, current_offer_version_id, current_profile_version_id, 'jobmatch-job-match-v6', 'gpt-5.4-mini', 'jobmatch-deterministic-r10-critical-priority:' || coalesce(v_contract_hash, 'pending'));
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || v_analysis_identity, 0));
  select * into current_filter from public.hard_filter_results h where h.user_id = actor_id and h.job_offer_id = p_offer_id and h.is_current order by h.created_at desc limit 1;
  if not found then raise exception 'WORKSPACE_HARD_FILTER_REQUIRED'; end if;
  if current_filter.status = 'fail' and not p_allow_hard_filter_fail then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_HARD_FILTER'; end if;
  select exclusion_reason into exclusion from public.offer_user_state where user_id = actor_id and job_offer_id = p_offer_id;
  if exclusion = 'user_decision' then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_EXCLUSION'; end if;
  select * into active_item from public.analysis_queue q where q.user_id = actor_id and q.job_offer_id = p_offer_id and (q.status = 'processing' or (q.status = 'queued' and q.last_error is null)) order by q.queued_at desc limit 1;
  if found then return jsonb_build_object('queueItem', to_jsonb(active_item), 'idempotent', true, 'reused', false); end if;
  if not p_force_reanalysis and v_contract_hash is not null then
    select q.* into reusable_item
    from public.analysis_versions v
    join public.workspace_job_analyses a on a.id = v.job_analysis_id and a.user_id = v.user_id and a.latest_version_id = v.id
    join public.analysis_queue q on q.id = v.queue_item_id and q.user_id = v.user_id
    where v.user_id = actor_id and v.job_offer_id = p_offer_id and v.offer_version_id = current_offer_version_id
      and v.profile_version_id = current_profile_version_id and v.analysis_identity = v_analysis_identity
      and v.prompt_version = 'jobmatch-job-match-v6'
      and v.model_version = 'gpt-5.4-mini'
      and v.algorithm_version = 'jobmatch-deterministic-r10-critical-priority'
      and q.status = 'completed' and q.provider_response_id is not null
      and jsonb_typeof(v.analysis_data) = 'object' and v.analysis_data ->> 'offerId' = p_offer_id::text
    order by v.created_at desc limit 1;
    if found then return jsonb_build_object('queueItem', to_jsonb(reusable_item), 'idempotent', true, 'reused', true); end if;
  end if;
  select exists(select 1 from public.workspace_job_analyses a where a.user_id = actor_id and a.job_offer_id = p_offer_id and a.latest_version_id is not null) into has_analysis;
  insert into public.analysis_queue (user_id, job_offer_id, offer_version_id, profile_version_id, hard_filter_result_id, analysis_identity, status, request_type, requested_by, max_attempts)
  values (actor_id, p_offer_id, current_offer_version_id, current_profile_version_id, current_filter.id, v_analysis_identity, 'queued', case when p_force_reanalysis or has_analysis then 'reanalysis' else 'initial' end, 'user', 2)
  returning * into created_item;
  insert into public.offer_user_state (user_id, job_offer_id, lifecycle_status, favorite, applied, state_metadata)
  values (actor_id, p_offer_id, 'selected_for_analysis', false, false, '{}'::jsonb)
  on conflict (user_id, job_offer_id) do update set lifecycle_status = case when public.offer_user_state.exclusion_reason = 'user_decision' then public.offer_user_state.lifecycle_status else 'selected_for_analysis' end, updated_at = now();
  return jsonb_build_object('queueItem', to_jsonb(created_item), 'idempotent', false, 'reused', false);
end;
$$;

revoke all on function public.workspace_enqueue_analysis_internal(uuid, boolean, boolean) from public, anon, authenticated, service_role;

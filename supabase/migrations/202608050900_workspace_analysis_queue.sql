-- R1.5: durable, explicitly triggered AI queue and versioned analysis writes.
-- Additive only: legacy job_analyses remains read-only compatibility data.

create unique index if not exists analysis_versions_one_per_queue_item
  on public.analysis_versions (queue_item_id) where queue_item_id is not null;
create index if not exists analysis_queue_user_offer_status_idx
  on public.analysis_queue (user_id, job_offer_id, status, queued_at);
alter table public.analysis_queue add column if not exists provider_response_id text;

create or replace function public.workspace_enqueue_analysis(offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  current_profile_version_id uuid;
  current_offer_version_id uuid;
  current_filter public.hard_filter_results%rowtype;
  active_item public.analysis_queue%rowtype;
  created_item public.analysis_queue%rowtype;
  has_analysis boolean := false;
  exclusion text;
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || offer_id::text, 0));
  select p.current_version_id into current_profile_version_id from public.profiles p where p.user_id = actor_id;
  if current_profile_version_id is null then raise exception 'WORKSPACE_PROFILE_VERSION_REQUIRED'; end if;
  select o.current_version_id into current_offer_version_id from public.job_offers o where o.id = offer_id and o.user_id = actor_id;
  if current_offer_version_id is null then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if;
  select * into current_filter from public.hard_filter_results h where h.user_id = actor_id and h.job_offer_id = offer_id and h.is_current order by h.created_at desc limit 1;
  if not found then raise exception 'WORKSPACE_HARD_FILTER_REQUIRED'; end if;
  if current_filter.status = 'fail' then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_HARD_FILTER'; end if;
  select exclusion_reason into exclusion from public.offer_user_state where user_id = actor_id and job_offer_id = offer_id;
  if exclusion = 'user_decision' then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_EXCLUSION'; end if;
  select * into active_item from public.analysis_queue q where q.user_id = actor_id and q.job_offer_id = offer_id and q.status in ('queued', 'processing') order by q.queued_at desc limit 1;
  if found then return jsonb_build_object('queueItem', to_jsonb(active_item), 'idempotent', true); end if;
  select exists(select 1 from public.workspace_job_analyses a where a.user_id = actor_id and a.job_offer_id = offer_id and a.latest_version_id is not null) into has_analysis;
  insert into public.analysis_queue (user_id, job_offer_id, offer_version_id, profile_version_id, hard_filter_result_id, status, request_type, requested_by, max_attempts)
  values (actor_id, offer_id, current_offer_version_id, current_profile_version_id, current_filter.id, 'queued', case when has_analysis then 'reanalysis' else 'initial' end, 'user', 2)
  returning * into created_item;
  insert into public.offer_user_state (user_id, job_offer_id, lifecycle_status, favorite, applied, state_metadata)
  values (actor_id, offer_id, 'selected_for_analysis', false, false, '{}'::jsonb)
  on conflict (user_id, job_offer_id) do update set lifecycle_status = case when public.offer_user_state.exclusion_reason = 'user_decision' then public.offer_user_state.lifecycle_status else 'selected_for_analysis' end, updated_at = now();
  return jsonb_build_object('queueItem', to_jsonb(created_item), 'idempotent', false);
end;
$$;

create or replace function public.workspace_cancel_queued_analysis(queue_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  item public.analysis_queue%rowtype;
  filter_status text;
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  select * into item from public.analysis_queue q where q.id = queue_item_id and q.user_id = actor_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  if item.status = 'processing' then raise exception 'WORKSPACE_ANALYSIS_PROCESSING_CANNOT_CANCEL'; end if;
  if item.status <> 'queued' then return jsonb_build_object('queueItem', to_jsonb(item), 'idempotent', true); end if;
  update public.analysis_queue set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = item.id returning * into item;
  select h.status into filter_status from public.hard_filter_results h where h.user_id = actor_id and h.job_offer_id = item.job_offer_id and h.is_current;
  update public.offer_user_state s set lifecycle_status = case when filter_status = 'needs_review' then 'needs_review' else 'new' end, updated_at = now()
  where s.user_id = actor_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded';
  return jsonb_build_object('queueItem', to_jsonb(item), 'idempotent', false);
end;
$$;

create or replace function public.workspace_claim_analysis(queue_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.analysis_queue%rowtype;
  filter_row public.hard_filter_results%rowtype;
  profile_data jsonb;
  offer_data jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select * into item from public.analysis_queue q where q.id = queue_item_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  if item.status = 'completed' then return null; end if;
  if item.status = 'processing' and item.lease_expires_at > now() then raise exception 'WORKSPACE_ANALYSIS_ALREADY_CLAIMED'; end if;
  if item.status not in ('queued', 'processing') then return null; end if;
  if item.attempt_count >= item.max_attempts then
    update public.analysis_queue set status = 'failed', last_error = coalesce(last_error, 'ANALYSIS_MAX_ATTEMPTS_REACHED'), updated_at = now() where id = item.id;
    return null;
  end if;
  update public.analysis_queue set status = 'processing', attempt_count = attempt_count + 1, locked_at = now(), lease_expires_at = now() + interval '5 minutes', worker_token = encode(gen_random_bytes(24), 'hex'), started_at = coalesce(started_at, now()), updated_at = now() where id = item.id returning * into item;
  select pv.profile_data into profile_data from public.profile_versions pv where pv.id = item.profile_version_id and pv.user_id = item.user_id;
  select ov.offer_data into offer_data from public.offer_versions ov where ov.id = item.offer_version_id and ov.user_id = item.user_id;
  select * into filter_row from public.hard_filter_results h where h.id = item.hard_filter_result_id and h.user_id = item.user_id;
  if profile_data is null or offer_data is null or not found then
    update public.analysis_queue set status = 'failed', last_error = 'WORKSPACE_ANALYSIS_CONTEXT_INVALID', worker_token = null, locked_at = null, lease_expires_at = null, updated_at = now() where id = item.id;
    update public.offer_user_state s set lifecycle_status = case when filter_row.status = 'needs_review' then 'needs_review' else 'new' end, updated_at = now()
    where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded';
    return null;
  end if;
  return jsonb_build_object('queueItem', to_jsonb(item), 'profile', profile_data, 'offer', offer_data, 'hardFilter', jsonb_build_object('status', filter_row.status, 'reasons', filter_row.reasons));
end;
$$;

create or replace function public.workspace_claim_next_analysis()
returns jsonb language plpgsql security definer set search_path = public as $$
declare candidate_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select q.id into candidate_id from public.analysis_queue q
  where q.status = 'queued' or (q.status = 'processing' and q.lease_expires_at <= now())
  order by q.queued_at for update skip locked limit 1;
  if candidate_id is null then return null; end if;
  return public.workspace_claim_analysis(candidate_id);
end;
$$;

create or replace function public.workspace_complete_analysis(queue_item_id uuid, worker_token text, analysis_data jsonb, model_version text, prompt_version text, algorithm_version text, source_quality text, provider_request_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.analysis_queue%rowtype;
  analysis_id uuid;
  version_row public.analysis_versions%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select * into item from public.analysis_queue q where q.id = queue_item_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  select * into version_row from public.analysis_versions v where v.queue_item_id = queue_item_id limit 1;
  if found then return jsonb_build_object('analysisVersion', to_jsonb(version_row), 'idempotent', true); end if;
  if item.status <> 'processing' or item.worker_token is distinct from worker_token or item.lease_expires_at <= now() then raise exception 'WORKSPACE_ANALYSIS_STALE_WORKER'; end if;
  if jsonb_typeof(analysis_data) <> 'object' then raise exception 'WORKSPACE_ANALYSIS_INVALID_RESULT'; end if;
  insert into public.workspace_job_analyses (user_id, job_offer_id)
  values (item.user_id, item.job_offer_id)
  on conflict (user_id, job_offer_id) do update set updated_at = now()
  returning id into analysis_id;
  insert into public.analysis_versions (user_id, job_analysis_id, job_offer_id, offer_version_id, profile_version_id, queue_item_id, analysis_data, hard_filter_status, model_provider, model_version, prompt_version, algorithm_version, confidence, coverage, source_type, source_quality)
  values (item.user_id, analysis_id, item.job_offer_id, item.offer_version_id, item.profile_version_id, item.id, analysis_data, coalesce(analysis_data ->> 'hardFilterStatus', 'pass'), 'openai', model_version, nullif(prompt_version, ''), algorithm_version, null, null, 'edge_function', source_quality)
  on conflict (queue_item_id) where queue_item_id is not null do nothing
  returning * into version_row;
  if version_row.id is null then select * into version_row from public.analysis_versions v where v.queue_item_id = item.id; end if;
  update public.workspace_job_analyses set latest_version_id = version_row.id, updated_at = now() where id = analysis_id and user_id = item.user_id;
  update public.analysis_queue set status = 'completed', completed_at = now(), worker_token = null, locked_at = null, lease_expires_at = null, last_error = null, updated_at = now() where id = item.id;
  update public.offer_user_state s set lifecycle_status = 'analyzed', updated_at = now()
  where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded'
    and not exists (select 1 from public.hard_filter_results h where h.user_id = item.user_id and h.job_offer_id = item.job_offer_id and h.is_current and h.status = 'fail');
  return jsonb_build_object('analysisVersion', to_jsonb(version_row), 'idempotent', false, 'providerRequestId', provider_request_id);
end;
$$;

create or replace function public.workspace_record_provider_response(p_queue_item_id uuid, p_worker_token text, p_provider_response_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  if nullif(p_provider_response_id, '') is null then raise exception 'WORKSPACE_PROVIDER_RESPONSE_REQUIRED'; end if;
  update public.analysis_queue
  set provider_response_id = p_provider_response_id, updated_at = now()
  where id = p_queue_item_id and status = 'processing' and worker_token is not distinct from p_worker_token and lease_expires_at > now();
  if not found then raise exception 'WORKSPACE_ANALYSIS_STALE_WORKER'; end if;
end;
$$;

create or replace function public.workspace_fail_analysis(queue_item_id uuid, worker_token text, error_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.analysis_queue%rowtype; fallback_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select * into item from public.analysis_queue q where q.id = queue_item_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  if item.status <> 'processing' or item.worker_token is distinct from worker_token or item.lease_expires_at <= now() then raise exception 'WORKSPACE_ANALYSIS_STALE_WORKER'; end if;
  if item.attempt_count >= item.max_attempts or error_code = 'ANALYSIS_PROVIDER_RECEIPT_SAVE_FAILED' then
    update public.analysis_queue set status = 'failed', last_error = left(coalesce(nullif(error_code, ''), 'ANALYSIS_FAILED'), 2000), worker_token = null, locked_at = null, lease_expires_at = null, updated_at = now() where id = item.id returning * into item;
    select h.status into fallback_status from public.hard_filter_results h where h.user_id = item.user_id and h.job_offer_id = item.job_offer_id and h.is_current;
    update public.offer_user_state s set lifecycle_status = case when fallback_status = 'needs_review' then 'needs_review' else 'new' end, updated_at = now() where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded';
  else
    update public.analysis_queue set status = 'queued', last_error = left(coalesce(nullif(error_code, ''), 'ANALYSIS_FAILED'), 2000), worker_token = null, locked_at = null, lease_expires_at = null, updated_at = now() where id = item.id returning * into item;
  end if;
  return to_jsonb(item);
end;
$$;

-- Queue and canonical version writes are exclusively mediated by the RPCs above.
revoke insert, update, delete on public.analysis_queue from authenticated;
revoke insert, update, delete on public.workspace_job_analyses from authenticated;
revoke insert, update, delete on public.analysis_versions from authenticated;
revoke all on function public.workspace_enqueue_analysis(uuid) from public;
revoke all on function public.workspace_cancel_queued_analysis(uuid) from public;
revoke all on function public.workspace_claim_analysis(uuid) from public;
revoke all on function public.workspace_claim_next_analysis() from public;
revoke all on function public.workspace_complete_analysis(uuid, text, jsonb, text, text, text, text, text) from public;
revoke all on function public.workspace_record_provider_response(uuid, text, text) from public;
revoke all on function public.workspace_fail_analysis(uuid, text, text) from public;
grant execute on function public.workspace_enqueue_analysis(uuid), public.workspace_cancel_queued_analysis(uuid) to authenticated;
grant execute on function public.workspace_claim_analysis(uuid), public.workspace_claim_next_analysis(), public.workspace_complete_analysis(uuid, text, jsonb, text, text, text, text, text), public.workspace_record_provider_response(uuid, text, text), public.workspace_fail_analysis(uuid, text, text) to service_role;

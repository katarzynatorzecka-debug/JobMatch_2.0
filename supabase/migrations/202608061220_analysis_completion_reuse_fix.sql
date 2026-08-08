-- Recovery V2 Phase 4 correction: complete cached provider responses safely.
-- Additive only. No historical rows are rewritten or removed.

create or replace function public.workspace_claim_analysis(queue_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.analysis_queue%rowtype;
  filter_row public.hard_filter_results%rowtype;
  profile_data jsonb;
  offer_data jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select * into item from public.analysis_queue q where q.id = workspace_claim_analysis.queue_item_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  if item.status = 'completed' then return null; end if;
  if item.status = 'processing' and item.lease_expires_at > now() then raise exception 'WORKSPACE_ANALYSIS_ALREADY_CLAIMED'; end if;
  if item.status not in ('queued', 'processing') then return null; end if;
  if item.attempt_count >= item.max_attempts and item.provider_response_id is null then
    update public.analysis_queue set status = 'failed', last_error = coalesce(last_error, 'ANALYSIS_MAX_ATTEMPTS_REACHED'), updated_at = now() where id = item.id;
    return null;
  end if;
  update public.analysis_queue
  set status = 'processing',
      attempt_count = case when item.provider_response_id is null then attempt_count + 1 else attempt_count end,
      locked_at = now(),
      lease_expires_at = now() + interval '5 minutes',
      worker_token = encode(extensions.gen_random_bytes(24), 'hex'),
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = item.id
  returning * into item;
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
  insert into public.workspace_job_analyses (user_id, job_offer_id)
  values (item.user_id, item.job_offer_id)
  on conflict (user_id, job_offer_id) do update set updated_at = now()
  returning id into analysis_id;
  insert into public.analysis_versions (user_id, job_analysis_id, job_offer_id, offer_version_id, profile_version_id, queue_item_id, analysis_identity, analysis_data, hard_filter_status, model_provider, model_version, prompt_version, algorithm_version, confidence, coverage, source_type, source_quality)
  values (item.user_id, analysis_id, item.job_offer_id, item.offer_version_id, item.profile_version_id, item.id, item.analysis_identity, analysis_data, coalesce(analysis_data ->> 'hardFilterStatus', 'pass'), 'openai', model_version, nullif(prompt_version, ''), algorithm_version, null, null, 'edge_function', source_quality)
  returning * into version_row;
  update public.workspace_job_analyses set latest_version_id = version_row.id, updated_at = now() where id = analysis_id and user_id = item.user_id;
  update public.analysis_queue set status = 'completed', completed_at = now(), worker_token = null, locked_at = null, lease_expires_at = null, last_error = null, updated_at = now() where id = item.id;
  update public.offer_user_state s set lifecycle_status = 'analyzed', updated_at = now()
  where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded'
    and not exists (select 1 from public.hard_filter_results h where h.user_id = item.user_id and h.job_offer_id = item.job_offer_id and h.is_current and h.status = 'fail');
  return jsonb_build_object('analysisVersion', to_jsonb(version_row), 'idempotent', false, 'providerRequestId', provider_request_id);
end;
$$;

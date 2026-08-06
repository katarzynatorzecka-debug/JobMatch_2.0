-- R1.5 correction: queue-row locking plus the existing version lookup already
-- provide idempotency. Removing the partial ON CONFLICT inference avoids a
-- PL/pgSQL parameter/column name collision without changing stored data.

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
  if jsonb_typeof(analysis_data) <> 'object' then raise exception 'WORKSPACE_ANALYSIS_INVALID_RESULT'; end if;
  insert into public.workspace_job_analyses (user_id, job_offer_id)
  values (item.user_id, item.job_offer_id)
  on conflict (user_id, job_offer_id) do update set updated_at = now()
  returning id into analysis_id;
  insert into public.analysis_versions (user_id, job_analysis_id, job_offer_id, offer_version_id, profile_version_id, queue_item_id, analysis_data, hard_filter_status, model_provider, model_version, prompt_version, algorithm_version, confidence, coverage, source_type, source_quality)
  values (item.user_id, analysis_id, item.job_offer_id, item.offer_version_id, item.profile_version_id, item.id, analysis_data, coalesce(analysis_data ->> 'hardFilterStatus', 'pass'), 'openai', model_version, nullif(prompt_version, ''), algorithm_version, null, null, 'edge_function', source_quality)
  returning * into version_row;
  update public.workspace_job_analyses set latest_version_id = version_row.id, updated_at = now() where id = analysis_id and user_id = item.user_id;
  update public.analysis_queue set status = 'completed', completed_at = now(), worker_token = null, locked_at = null, lease_expires_at = null, last_error = null, updated_at = now() where id = item.id;
  update public.offer_user_state s set lifecycle_status = 'analyzed', updated_at = now()
  where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded'
    and not exists (select 1 from public.hard_filter_results h where h.user_id = item.user_id and h.job_offer_id = item.job_offer_id and h.is_current and h.status = 'fail');
  return jsonb_build_object('analysisVersion', to_jsonb(version_row), 'idempotent', false, 'providerRequestId', provider_request_id);
end;
$$;

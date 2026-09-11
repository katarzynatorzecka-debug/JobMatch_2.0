-- R1.5 correction: pgcrypto is installed in the Supabase extensions schema.
-- No data migration, reset, backfill, or destructive operation is performed.

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
  update public.analysis_queue set status = 'processing', attempt_count = attempt_count + 1, locked_at = now(), lease_expires_at = now() + interval '5 minutes', worker_token = encode(extensions.gen_random_bytes(24), 'hex'), started_at = coalesce(started_at, now()), updated_at = now() where id = item.id returning * into item;
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

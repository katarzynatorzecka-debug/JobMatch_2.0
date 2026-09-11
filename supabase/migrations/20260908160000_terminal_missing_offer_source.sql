-- A confirmed 404/410 is not a retryable provider failure.  Preserve the
-- queue record for audit, but release it as terminal so the UI does not keep
-- offering an identical analysis attempt for a deleted public listing.

create or replace function public.workspace_fail_analysis(queue_item_id uuid, worker_token text, error_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.analysis_queue%rowtype; fallback_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'WORKSPACE_WORKER_FORBIDDEN'; end if;
  select * into item from public.analysis_queue q where q.id = queue_item_id for update;
  if not found then raise exception 'WORKSPACE_ANALYSIS_NOT_FOUND'; end if;
  if item.status <> 'processing' or item.worker_token is distinct from worker_token or item.lease_expires_at <= now() then raise exception 'WORKSPACE_ANALYSIS_STALE_WORKER'; end if;
  if item.attempt_count >= item.max_attempts or error_code in ('ANALYSIS_PROVIDER_RECEIPT_SAVE_FAILED', 'WORKSPACE_ANALYSIS_SOURCE_UNAVAILABLE') then
    update public.analysis_queue set status = 'failed', last_error = left(coalesce(nullif(error_code, ''), 'ANALYSIS_FAILED'), 2000), worker_token = null, locked_at = null, lease_expires_at = null, updated_at = now() where id = item.id returning * into item;
    select h.status into fallback_status from public.hard_filter_results h where h.user_id = item.user_id and h.job_offer_id = item.job_offer_id and h.is_current;
    update public.offer_user_state s set lifecycle_status = case when fallback_status = 'needs_review' then 'needs_review' else 'new' end, updated_at = now() where s.user_id = item.user_id and s.job_offer_id = item.job_offer_id and s.lifecycle_status <> 'excluded';
  else
    update public.analysis_queue set status = 'queued', last_error = left(coalesce(nullif(error_code, ''), 'ANALYSIS_FAILED'), 2000), worker_token = null, locked_at = null, lease_expires_at = null, updated_at = now() where id = item.id returning * into item;
  end if;
  return to_jsonb(item);
end;
$$;

revoke all on function public.workspace_fail_analysis(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.workspace_fail_analysis(uuid, text, text) to service_role;

-- Integrated analysis flow: an explicit, user-confirmed opt-in for one Hard Filter FAIL offer.
-- Additive only. The ordinary enqueue RPC remains the default and keeps FAIL blocked.

create or replace function public.workspace_enqueue_analysis_override(offer_id uuid)
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
  if current_filter.status <> 'fail' then raise exception 'WORKSPACE_ANALYSIS_OVERRIDE_NOT_APPLICABLE'; end if;
  select exclusion_reason into exclusion from public.offer_user_state where user_id = actor_id and job_offer_id = offer_id;
  if exclusion = 'user_decision' then raise exception 'WORKSPACE_ANALYSIS_BLOCKED_BY_EXCLUSION'; end if;
  select * into active_item from public.analysis_queue q where q.user_id = actor_id and q.job_offer_id = offer_id and q.status in ('queued', 'processing') order by q.queued_at desc limit 1;
  if found then return jsonb_build_object('queueItem', to_jsonb(active_item), 'idempotent', true); end if;
  select exists(select 1 from public.workspace_job_analyses a where a.user_id = actor_id and a.job_offer_id = offer_id and a.latest_version_id is not null) into has_analysis;
  insert into public.analysis_queue (user_id, job_offer_id, offer_version_id, profile_version_id, hard_filter_result_id, status, request_type, requested_by, max_attempts)
  values (actor_id, offer_id, current_offer_version_id, current_profile_version_id, current_filter.id, 'queued', case when has_analysis then 'reanalysis' else 'initial' end, 'user', 2)
  returning * into created_item;
  return jsonb_build_object('queueItem', to_jsonb(created_item), 'idempotent', false);
end;
$$;

revoke all on function public.workspace_enqueue_analysis_override(uuid) from public;
grant execute on function public.workspace_enqueue_analysis_override(uuid) to authenticated;

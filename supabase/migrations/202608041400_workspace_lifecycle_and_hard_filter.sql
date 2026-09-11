-- R1.4: durable lifecycle state and current Hard Filter results. Additive only.
create unique index if not exists hard_filter_results_one_current_per_offer
  on public.hard_filter_results (user_id, job_offer_id) where is_current;

create or replace function public.workspace_persist_hard_filter_batch(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  actor_id uuid := auth.uid();
  v_profile_id uuid;
  profile_version_id uuid;
  current_hash text;
  next_version integer;
  item jsonb;
  result_id uuid;
  result_ids jsonb := '[]'::jsonb;
  state_status text;
  now_at timestamptz := now();
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  if coalesce(jsonb_array_length(payload -> 'items'), 0) = 0 then raise exception 'WORKSPACE_HARD_FILTER_ITEMS_REQUIRED'; end if;
  if nullif(payload ->> 'profileHash', '') is null then raise exception 'WORKSPACE_PROFILE_HASH_REQUIRED'; end if;

  insert into public.profiles (user_id, profile_data)
  values (actor_id, coalesce(payload -> 'profile', '{}'::jsonb))
  on conflict (user_id) do update set profile_data = excluded.profile_data
  returning id into v_profile_id;

  select pv.content_hash into current_hash
  from public.profiles p left join public.profile_versions pv on pv.id = p.current_version_id and pv.user_id = p.user_id
  where p.id = v_profile_id and p.user_id = actor_id;
  if current_hash is distinct from payload ->> 'profileHash' then
    select coalesce(max(pv.version_number), 0) + 1 into next_version from public.profile_versions pv where pv.profile_id = v_profile_id and pv.user_id = actor_id;
    insert into public.profile_versions (user_id, profile_id, version_number, profile_data, content_hash)
    values (actor_id, v_profile_id, next_version, coalesce(payload -> 'profile', '{}'::jsonb), payload ->> 'profileHash') returning id into profile_version_id;
    update public.profiles set current_version_id = profile_version_id, updated_at = now_at where id = v_profile_id and user_id = actor_id;
  else
    select current_version_id into profile_version_id from public.profiles where id = v_profile_id and user_id = actor_id;
  end if;

  for item in select value from jsonb_array_elements(payload -> 'items') loop
    if not exists (select 1 from public.job_offers o join public.offer_versions v on v.id = (item ->> 'offerVersionId')::uuid and v.job_offer_id = o.id and v.user_id = o.user_id where o.id = (item ->> 'jobOfferId')::uuid and o.user_id = actor_id) then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if;
    update public.hard_filter_results set is_current = false where user_id = actor_id and job_offer_id = (item ->> 'jobOfferId')::uuid and is_current;
    insert into public.hard_filter_results (user_id, job_offer_id, offer_version_id, profile_version_id, status, reasons, missing_information, checked_criteria, algorithm_version, is_current)
    values (actor_id, (item ->> 'jobOfferId')::uuid, (item ->> 'offerVersionId')::uuid, profile_version_id, item ->> 'status', coalesce(item -> 'reasons', '[]'::jsonb), coalesce(item -> 'missingInformation', '[]'::jsonb), coalesce(item -> 'checkedCriteria', '[]'::jsonb), payload ->> 'algorithmVersion', true)
    returning id into result_id;
    result_ids := result_ids || to_jsonb(result_id);
    insert into public.offer_user_state (user_id, job_offer_id, lifecycle_status, favorite, applied, state_metadata)
    values (actor_id, (item ->> 'jobOfferId')::uuid, case when item ->> 'status' = 'fail' then 'excluded' when item ->> 'status' = 'needs_review' then 'needs_review' else 'new' end, false, false, '{}'::jsonb)
    on conflict (user_id, job_offer_id) do nothing;
    select lifecycle_status into state_status from public.offer_user_state where user_id = actor_id and job_offer_id = (item ->> 'jobOfferId')::uuid;
    if item ->> 'status' = 'fail' then
      update public.offer_user_state s set state_metadata = case when s.lifecycle_status <> 'excluded' then s.state_metadata || jsonb_build_object('previousLifecycleStatus', s.lifecycle_status) else s.state_metadata end, lifecycle_status = 'excluded', exclusion_reason = 'hard_filter_fail', excluded_at = now_at, updated_at = now_at where s.user_id = actor_id and s.job_offer_id = (item ->> 'jobOfferId')::uuid;
    elsif state_status <> 'excluded' then
      update public.offer_user_state s set lifecycle_status = case when item ->> 'status' = 'needs_review' then 'needs_review' else 'new' end, exclusion_reason = null, excluded_at = null, updated_at = now_at where s.user_id = actor_id and s.job_offer_id = (item ->> 'jobOfferId')::uuid;
    end if;
  end loop;
  return jsonb_build_object('profileVersionId', profile_version_id, 'hardFilterResultIds', result_ids);
end;
$$;

create or replace function public.workspace_set_offer_favorite(offer_id uuid, favorite boolean) returns void language plpgsql security invoker set search_path = public as $$ begin update public.offer_user_state set favorite = workspace_set_offer_favorite.favorite, updated_at = now() where user_id = auth.uid() and job_offer_id = offer_id; if not found then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if; end; $$;
create or replace function public.workspace_set_offer_applied(offer_id uuid, applied boolean) returns void language plpgsql security invoker set search_path = public as $$ begin update public.offer_user_state set applied = workspace_set_offer_applied.applied, updated_at = now() where user_id = auth.uid() and job_offer_id = offer_id; if not found then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if; end; $$;
create or replace function public.workspace_exclude_offer(offer_id uuid) returns void language plpgsql security invoker set search_path = public as $$ begin update public.offer_user_state s set state_metadata = case when s.lifecycle_status <> 'excluded' then s.state_metadata || jsonb_build_object('previousLifecycleStatus', s.lifecycle_status) else s.state_metadata end, lifecycle_status = 'excluded', exclusion_reason = 'user_decision', excluded_at = now(), updated_at = now() where s.user_id = auth.uid() and s.job_offer_id = offer_id and (s.lifecycle_status <> 'excluded' or s.exclusion_reason <> 'hard_filter_fail'); if not found and not exists (select 1 from public.offer_user_state s where s.user_id = auth.uid() and s.job_offer_id = offer_id) then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if; end; $$;
create or replace function public.workspace_restore_offer(offer_id uuid) returns void language plpgsql security invoker set search_path = public as $$ declare previous_status text; begin if exists (select 1 from public.hard_filter_results h where h.user_id = auth.uid() and h.job_offer_id = offer_id and h.is_current and h.status = 'fail') then raise exception 'WORKSPACE_RESTORE_BLOCKED_BY_HARD_FILTER'; end if; select state_metadata ->> 'previousLifecycleStatus' into previous_status from public.offer_user_state where user_id = auth.uid() and job_offer_id = offer_id; update public.offer_user_state set lifecycle_status = case when previous_status in ('analyzed', 'needs_review', 'new') then previous_status when exists (select 1 from public.hard_filter_results h where h.user_id = auth.uid() and h.job_offer_id = offer_id and h.is_current and h.status = 'needs_review') then 'needs_review' else 'new' end, exclusion_reason = null, restored_at = now(), updated_at = now() where user_id = auth.uid() and job_offer_id = offer_id and lifecycle_status = 'excluded'; if not found and not exists (select 1 from public.offer_user_state s where s.user_id = auth.uid() and s.job_offer_id = offer_id) then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if; end; $$;
create or replace function public.workspace_mark_offer_viewed(offer_id uuid) returns void language plpgsql security invoker set search_path = public as $$ begin update public.offer_user_state set last_viewed_at = now(), updated_at = now() where user_id = auth.uid() and job_offer_id = offer_id; if not found then raise exception 'WORKSPACE_OFFER_NOT_FOUND'; end if; insert into public.recently_viewed (user_id, job_offer_id, viewed_at) values (auth.uid(), offer_id, now()) on conflict (user_id, job_offer_id) do update set viewed_at = excluded.viewed_at; end; $$;

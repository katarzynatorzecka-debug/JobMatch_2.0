-- R1.2/R1.3: authenticated workspace import operations. Depends on 202608040000_workspace_foundation.sql.
alter table public.import_sessions add column if not exists import_idempotency_key text;
alter table public.import_sessions add column if not exists parser_version text;
create unique index if not exists import_sessions_user_idempotency_key_unique on public.import_sessions (user_id, import_idempotency_key) where import_idempotency_key is not null;

create or replace function public.workspace_import_report(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  import_key text := payload ->> 'idempotencyKey';
  session_id uuid;
  item jsonb;
  offer_id uuid;
  version_id uuid;
  current_hash text;
  next_version integer;
  match_kind text;
  candidates uuid[];
  now_at timestamptz := coalesce((payload ->> 'importedAt')::timestamptz, now());
  v_found_count integer := coalesce(jsonb_array_length(payload -> 'items'), 0) + coalesce(jsonb_array_length(payload -> 'invalidItems'), 0);
  v_new_count integer := 0;
  v_duplicate_count integer := 0;
  v_review_count integer := 0;
  v_invalid_count integer := coalesce(jsonb_array_length(payload -> 'invalidItems'), 0);
  existing_result jsonb;
  created_ids jsonb := '[]'::jsonb;
  reused_ids jsonb := '[]'::jsonb;
  possible_ids jsonb := '[]'::jsonb;
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  if import_key is null or import_key = '' then raise exception 'WORKSPACE_IDEMPOTENCY_KEY_REQUIRED'; end if;
  if coalesce(jsonb_array_length(payload -> 'items'), 0) = 0 then raise exception 'WORKSPACE_VALID_ITEMS_REQUIRED'; end if;

  select id into session_id from public.import_sessions where user_id = actor_id and import_idempotency_key = import_key;
  if session_id is not null then
    select jsonb_build_object('importSessionId', s.id, 'foundCount', s.found_count, 'newCount', s.new_count, 'duplicateCount', s.duplicate_count, 'invalidCount', s.invalid_count, 'needsReviewCount', s.needs_review_count, 'status', s.status, 'createdOfferIds', coalesce(s.operation_metadata -> 'createdOfferIds', '[]'::jsonb), 'reusedOfferIds', coalesce(s.operation_metadata -> 'reusedOfferIds', '[]'::jsonb), 'possibleDuplicateOfferIds', coalesce(s.operation_metadata -> 'possibleDuplicateOfferIds', '[]'::jsonb), 'invalidItems', coalesce(s.operation_metadata -> 'invalidItems', '[]'::jsonb), 'idempotent', true) into strict existing_result from public.import_sessions s where s.id = session_id;
    return existing_result;
  end if;

  insert into public.import_sessions (user_id, source_type, source_filename, offer_count, status, found_count, new_count, duplicate_count, invalid_count, needs_review_count, warnings, operation_metadata, import_idempotency_key, parser_version, created_at)
  values (actor_id, payload ->> 'sourceType', payload ->> 'fileName', v_found_count, 'active', v_found_count, 0, 0, v_invalid_count, 0, coalesce(payload -> 'warnings', '[]'::jsonb), '{}'::jsonb, import_key, payload ->> 'parserVersion', now_at)
  returning id into session_id;

  for item in select value from jsonb_array_elements(payload -> 'items') loop
    offer_id := null; candidates := array[]::uuid[]; match_kind := 'new';
    if nullif(item ->> 'normalizedSourceUrl', '') is not null then
      select id into offer_id from public.job_offers where user_id = actor_id and normalized_source_url = item ->> 'normalizedSourceUrl';
      if offer_id is not null then match_kind := 'exact_url'; end if;
    end if;
    if offer_id is null and nullif(item ->> 'canonicalFingerprint', '') is not null then
      select coalesce(array_agg(id), array[]::uuid[]) into candidates from public.job_offers where user_id = actor_id and canonical_fingerprint = item ->> 'canonicalFingerprint' and (nullif(item ->> 'normalizedSourceUrl', '') is null or normalized_source_url is null or normalized_source_url = item ->> 'normalizedSourceUrl');
      if coalesce(array_length(candidates, 1), 0) = 1 then offer_id := candidates[1]; match_kind := 'canonical_high_confidence';
      elsif coalesce(array_length(candidates, 1), 0) > 1 then match_kind := 'possible_duplicate'; end if;
    end if;

    if offer_id is null then
      insert into public.job_offers (user_id, import_session_id, external_id, title, company, url, normalized_data, source_type, source_url, normalized_source_url, canonical_fingerprint, location, current_data, first_seen_at, last_seen_at, updated_at)
      values (actor_id, session_id, item ->> 'rawExternalId', item ->> 'title', item ->> 'company', nullif(item ->> 'sourceUrl', ''), item -> 'offerData', payload ->> 'sourceType', nullif(item ->> 'sourceUrl', ''), nullif(item ->> 'normalizedSourceUrl', ''), nullif(item ->> 'canonicalFingerprint', ''), nullif(item ->> 'location', ''), item -> 'offerData', now_at, now_at, now_at)
      returning id into offer_id;
      v_new_count := v_new_count + 1; created_ids := created_ids || to_jsonb(offer_id);
      if match_kind = 'possible_duplicate' then v_review_count := v_review_count + 1; possible_ids := possible_ids || to_jsonb(offer_id); end if;
    else
      v_duplicate_count := v_duplicate_count + 1; reused_ids := reused_ids || to_jsonb(offer_id);
      update public.job_offers set title = item ->> 'title', company = item ->> 'company', location = nullif(item ->> 'location', ''), source_url = nullif(item ->> 'sourceUrl', ''), normalized_source_url = nullif(item ->> 'normalizedSourceUrl', ''), canonical_fingerprint = nullif(item ->> 'canonicalFingerprint', ''), current_data = item -> 'offerData', normalized_data = item -> 'offerData', last_seen_at = now_at, updated_at = now_at where id = offer_id and user_id = actor_id;
    end if;

    select id, content_hash, version_number into version_id, current_hash, next_version from public.offer_versions where id = (select current_version_id from public.job_offers where id = offer_id) and user_id = actor_id;
    if version_id is null or current_hash is distinct from item ->> 'contentHash' then
      select coalesce(max(version_number), 0) + 1 into next_version from public.offer_versions where job_offer_id = offer_id and user_id = actor_id;
      insert into public.offer_versions (user_id, job_offer_id, version_number, offer_data, content_hash, source_url, observed_at, import_session_id, created_at)
      values (actor_id, offer_id, next_version, item -> 'offerData', item ->> 'contentHash', nullif(item ->> 'sourceUrl', ''), now_at, session_id, now_at)
      returning id into version_id;
      update public.job_offers set current_version_id = version_id where id = offer_id and user_id = actor_id;
    end if;
    insert into public.import_offer_links (user_id, import_session_id, job_offer_id, offer_version_id, match_type, raw_external_id, dedup_evidence, is_new, is_duplicate, needs_review, created_at)
    values (actor_id, session_id, offer_id, version_id, match_kind, item ->> 'rawExternalId', jsonb_build_object('candidateOfferIds', candidates), match_kind in ('new', 'possible_duplicate'), match_kind in ('exact_url', 'canonical_high_confidence'), match_kind = 'possible_duplicate', now_at);
    insert into public.offer_user_state (user_id, job_offer_id, lifecycle_status, favorite, applied, state_metadata, created_at, updated_at)
    values (actor_id, offer_id, 'new', false, false, '{}'::jsonb, now_at, now_at) on conflict (user_id, job_offer_id) do nothing;
  end loop;

  update public.import_sessions s set status = case when v_invalid_count > 0 then 'partial' else 'active' end, new_count = v_new_count, duplicate_count = v_duplicate_count, invalid_count = v_invalid_count, needs_review_count = v_review_count, operation_metadata = jsonb_build_object('idempotencyKey', import_key, 'parserVersion', payload ->> 'parserVersion', 'invalidItems', coalesce(payload -> 'invalidItems', '[]'::jsonb), 'createdOfferIds', created_ids, 'reusedOfferIds', reused_ids, 'possibleDuplicateOfferIds', possible_ids) where s.id = session_id;
  return jsonb_build_object('importSessionId', session_id, 'foundCount', v_found_count, 'newCount', v_new_count, 'duplicateCount', v_duplicate_count, 'invalidCount', v_invalid_count, 'needsReviewCount', v_review_count, 'status', case when v_invalid_count > 0 then 'partial' else 'active' end, 'createdOfferIds', created_ids, 'reusedOfferIds', reused_ids, 'possibleDuplicateOfferIds', possible_ids, 'invalidItems', coalesce(payload -> 'invalidItems', '[]'::jsonb), 'idempotent', false);
end;
$$;

create or replace function public.workspace_revert_import(import_session_id uuid) returns void language plpgsql security invoker set search_path = public as $$ begin update public.import_sessions set status = 'reverted', reverted_at = now(), operation_metadata = operation_metadata || jsonb_build_object('revertedAt', now()) where id = import_session_id and user_id = auth.uid() and status <> 'reverted'; if not found then raise exception 'WORKSPACE_IMPORT_NOT_FOUND'; end if; end; $$;
create or replace function public.workspace_reactivate_import(import_session_id uuid) returns void language plpgsql security invoker set search_path = public as $$ begin update public.import_sessions set status = 'active', reactivated_at = now(), operation_metadata = operation_metadata || jsonb_build_object('reactivatedAt', now()) where id = import_session_id and user_id = auth.uid() and status = 'reverted'; if not found then raise exception 'WORKSPACE_REVERTED_IMPORT_NOT_FOUND'; end if; end; $$;

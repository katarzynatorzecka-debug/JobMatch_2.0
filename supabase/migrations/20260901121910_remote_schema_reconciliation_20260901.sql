drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.workspace_set_active_import_session(import_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  actor_id uuid := auth.uid();
  session_status text;
begin
  if actor_id is null then raise exception 'WORKSPACE_AUTH_REQUIRED'; end if;
  if import_session_id is not null then
    select s.status into session_status
    from public.import_sessions s
    where s.id = workspace_set_active_import_session.import_session_id
      and s.user_id = actor_id;
    if not found then raise exception 'WORKSPACE_IMPORT_NOT_FOUND'; end if;
    if session_status = 'reverted' then raise exception 'WORKSPACE_ACTIVE_IMPORT_REVERTED'; end if;
  end if;
  update public.profiles p
  set active_import_session_id = workspace_set_active_import_session.import_session_id,
      updated_at = now()
  where p.user_id = actor_id;
  if not found then raise exception 'WORKSPACE_PROFILE_NOT_FOUND'; end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.workspace_sync_active_import_pointer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'reverted' then
    update public.profiles p
    set active_import_session_id = null,
        updated_at = now()
    where p.user_id = new.user_id
      and p.active_import_session_id = new.id;
  else
    update public.profiles p
    set active_import_session_id = new.id,
        updated_at = now()
    where p.user_id = new.user_id;
  end if;
  return new;
end;
$function$
;

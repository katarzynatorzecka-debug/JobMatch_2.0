-- Recovery V2: persist the authenticated workspace active import pointer.
alter table public.profiles
  add column if not exists active_import_session_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_active_import_user_fkey') then
    alter table public.profiles
      add constraint profiles_active_import_user_fkey
      foreign key (active_import_session_id, user_id)
      references public.import_sessions(id, user_id)
      on delete set null (active_import_session_id);
  end if;
end;
$$;

create or replace function public.workspace_set_active_import_session(import_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

create or replace function public.workspace_sync_active_import_pointer()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

drop trigger if exists workspace_sync_active_import_pointer on public.import_sessions;
create trigger workspace_sync_active_import_pointer
after insert or update of status on public.import_sessions
for each row execute function public.workspace_sync_active_import_pointer();

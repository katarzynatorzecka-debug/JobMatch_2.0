-- Profile presentation metadata is intentionally separate from the analysis profile.
alter table public.profiles
  add column if not exists presentation_data jsonb not null default '{}'::jsonb;
create table if not exists public.job_analyses (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, job_offer_id text not null, filter_status text not null check (filter_status in ('pass', 'weak', 'fail')), analysis_data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id, job_offer_id));
create index if not exists job_analyses_user_id_idx on public.job_analyses(user_id);
alter table public.job_analyses enable row level security;
create policy "job analyses own rows" on public.job_analyses for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

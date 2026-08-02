alter table public.job_offers add column if not exists source_data jsonb;

comment on column public.job_offers.source_data is 'Normalized offer-page source only. Never raw HTML, DOM, scripts, trackers, or EML.';

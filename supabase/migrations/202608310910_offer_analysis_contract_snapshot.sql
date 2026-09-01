-- Stable, public offer input for analysis replay. Additive only: no existing
-- offer, version, analysis or queue record is rewritten or removed.

alter table public.offer_versions
  add column if not exists analysis_source_snapshot jsonb,
  add column if not exists analysis_source_hash text,
  add column if not exists analysis_criteria_manifest jsonb,
  add column if not exists analysis_contract_version text;

alter table public.offer_versions
  add constraint offer_versions_analysis_snapshot_object_check
  check (analysis_source_snapshot is null or jsonb_typeof(analysis_source_snapshot) = 'object') not valid;

alter table public.offer_versions
  add constraint offer_versions_analysis_manifest_object_check
  check (analysis_criteria_manifest is null or jsonb_typeof(analysis_criteria_manifest) = 'object') not valid;

create index if not exists offer_versions_analysis_contract_lookup_idx
  on public.offer_versions (user_id, id)
  where analysis_contract_version is not null;

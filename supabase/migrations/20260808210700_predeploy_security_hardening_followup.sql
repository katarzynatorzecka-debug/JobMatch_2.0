-- Remove unintended Data API table grants from the internal migration marker.
-- Keep RLS and service-role operational access unchanged.
revoke all on table public.workspace_migration_runs from anon, authenticated;

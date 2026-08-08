-- Pre-deploy security hardening.
-- No data or table schema changes. Queue RPC call paths remain unchanged.

begin;

-- Worker-only RPCs: invoked by analyze-job-match with the service-role client.
revoke all on function public.workspace_claim_analysis(uuid) from public, anon, authenticated, service_role;
revoke all on function public.workspace_claim_next_analysis() from public, anon, authenticated, service_role;
revoke all on function public.workspace_complete_analysis(uuid, text, jsonb, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.workspace_fail_analysis(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.workspace_record_provider_response(uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.workspace_claim_analysis(uuid) to service_role;
grant execute on function public.workspace_claim_next_analysis() to service_role;
grant execute on function public.workspace_complete_analysis(uuid, text, jsonb, text, text, text, text, text) to service_role;
grant execute on function public.workspace_fail_analysis(uuid, text, text) to service_role;
grant execute on function public.workspace_record_provider_response(uuid, text, text) to service_role;

-- User-facing RPCs: invoked by authenticated users through the workspace repository.
revoke all on function public.workspace_enqueue_analysis(uuid) from public, anon, authenticated, service_role;
revoke all on function public.workspace_cancel_queued_analysis(uuid) from public, anon, authenticated, service_role;
revoke all on function public.workspace_enqueue_analysis_override(uuid) from public, anon, authenticated, service_role;
revoke all on function public.workspace_reanalyze_analysis(uuid) from public, anon, authenticated, service_role;

grant execute on function public.workspace_enqueue_analysis(uuid) to authenticated;
grant execute on function public.workspace_cancel_queued_analysis(uuid) to authenticated;
grant execute on function public.workspace_enqueue_analysis_override(uuid) to authenticated;
grant execute on function public.workspace_reanalyze_analysis(uuid) to authenticated;

-- Internal implementation/helper RPCs are called by the user-facing SECURITY DEFINER wrappers.
revoke all on function public.workspace_enqueue_analysis_internal(uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.workspace_analysis_identity(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

-- Pin the immutable helper's lookup path. It uses pg_catalog functions and the
-- explicitly-qualified extensions.digest function; pg_temp remains last for safety.
alter function public.workspace_analysis_identity(uuid, uuid, uuid, uuid, text, text, text)
  set search_path = public, pg_temp;

-- Internal migration marker: no application/runtime call path exists.
revoke all on table public.workspace_migration_runs from public;

commit;

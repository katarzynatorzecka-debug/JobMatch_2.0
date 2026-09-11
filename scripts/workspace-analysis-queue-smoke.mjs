import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'WORKSPACE_SMOKE_EMAIL', 'WORKSPACE_SMOKE_PASSWORD', 'WORKSPACE_SMOKE_SECOND_EMAIL', 'WORKSPACE_SMOKE_SECOND_PASSWORD']
const missing = required.filter((key) => !process.env[key])
if (missing.length) throw new Error(`R15_SMOKE_CONFIGURATION_MISSING:${missing.join(',')}`)
const cli = 'C:\\Program Files\\Supabase\\supabase.exe'
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const secondClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const runId = `r15-${Date.now()}`
const now = new Date().toISOString()
const assert = (value, code) => { if (!value) throw new Error(code) }
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const uuid = (value) => { assert(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value), 'R15_SMOKE_INVALID_UUID'); return value }

function dbQuery(sql) {
  const output = execFileSync(cli, ['db', 'query', '--linked', '--output', 'json', sql], { encoding: 'utf8', env: { ...process.env, SUPABASE_DISABLE_TELEMETRY: '1' } })
  const parsed = JSON.parse(output)
  return parsed.rows ?? []
}

async function rpc(name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`R15_SMOKE_RPC_${name}:${error.code ?? 'UNKNOWN'}:${error.message ?? 'UNKNOWN'}`)
  return data
}

async function safeFunctionErrorCode(error) {
  const context = error?.context
  if (!(context instanceof Response)) return 'HTTP'
  let code = 'HTTP'
  try {
    const body = await context.clone().json()
    if (typeof body?.code === 'string') code = body.code
  } catch { /* HTTP status remains sufficient and contains no user data. */ }
  return `${context.status}:${code}`
}

function runServerWorkerInvariants(userId, offerId) {
  const serviceContext = `select set_config('request.jwt.claim.role', 'service_role', true); select set_config('request.jwt.claim.sub', ${quote(userId)}, true);`
  const fakeAnalysis = quote(JSON.stringify({ offerId, overallScore: 50 }))
  const rows = dbQuery(`${serviceContext}
do $$
declare q uuid; token_one text; token_two text; complete_two jsonb; version_count integer;
begin
  -- Force an independently created reanalysis queue. A normal enqueue is
  -- allowed to reuse a completed result with the same analysis identity.
  q := ((public.workspace_reanalyze_analysis(${quote(offerId)}) -> 'queueItem' ->> 'id'))::uuid;
  token_one := (public.workspace_claim_analysis(q) -> 'queueItem' ->> 'worker_token');
  begin
    perform public.workspace_complete_analysis(q, 'stale-token', ${fakeAnalysis}::jsonb, 'test-model', 'test-prompt', 'test-algorithm', 'fixture', null);
    raise exception 'R15_SMOKE_STALE_TOKEN_ACCEPTED';
  exception when others then
    if sqlerrm like '%R15_SMOKE_STALE_TOKEN_ACCEPTED%' then raise; end if;
  end;
  update public.analysis_queue set lease_expires_at = now() - interval '1 second' where id = q;
  token_two := (public.workspace_claim_analysis(q) -> 'queueItem' ->> 'worker_token');
  if token_one is null or token_two is null or token_one = token_two then raise exception 'R15_SMOKE_LEASE_RECLAIM_FAILED'; end if;
  perform public.workspace_complete_analysis(q, token_two, ${fakeAnalysis}::jsonb, 'test-model', 'test-prompt', 'test-algorithm', 'fixture', null);
  complete_two := public.workspace_complete_analysis(q, token_two, ${fakeAnalysis}::jsonb, 'test-model', 'test-prompt', 'test-algorithm', 'fixture', null);
  select count(*) into version_count from public.analysis_versions where queue_item_id = q;
  if coalesce(complete_two ->> 'idempotent', 'false') <> 'true' or version_count <> 1 then raise exception 'R15_SMOKE_IDEMPOTENT_COMPLETE_RPC_FAILED'; end if;
end $$;
select 'server-invariants-passed' as result;`)
  assert(rows[0]?.result === 'server-invariants-passed', 'R15_SMOKE_SERVER_INVARIANTS_FAILED')
}

async function main() {
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email: process.env.WORKSPACE_SMOKE_EMAIL, password: process.env.WORKSPACE_SMOKE_PASSWORD })
  if (signInError || !signIn.user) throw new Error(`R15_SMOKE_SIGN_IN_A_FAILED:${signInError?.code ?? 'UNKNOWN'}`)
  const userId = uuid(signIn.user.id)
  const serviceContext = `select set_config('request.jwt.claim.role', 'service_role', true); select set_config('request.jwt.claim.sub', ${quote(userId)}, true);`
  const { data: secondSignIn, error: secondSignInError } = await secondClient.auth.signInWithPassword({ email: process.env.WORKSPACE_SMOKE_SECOND_EMAIL, password: process.env.WORKSPACE_SMOKE_SECOND_PASSWORD })
  if (secondSignInError || !secondSignIn.user) throw new Error(`R15_SMOKE_SIGN_IN_B_FAILED:${secondSignInError?.code ?? 'UNKNOWN'}`)

  const [{ data: profile }, { data: profileVersion }] = await Promise.all([
    client.from('profiles').select('current_version_id,profile_data').maybeSingle(),
    client.from('profiles').select('current_version_id').maybeSingle(),
  ])
  assert(profile?.current_version_id && profile?.profile_data && profileVersion?.current_version_id, 'R15_SMOKE_PROFILE_REQUIRED')
  const { data: currentProfileVersion, error: profileVersionError } = await client.from('profile_versions').select('content_hash').eq('id', profile.current_version_id).maybeSingle()
  if (profileVersionError || !currentProfileVersion?.content_hash) throw new Error('R15_SMOKE_PROFILE_VERSION_REQUIRED')

  if (process.argv.includes('--server-worker-invariants-only')) {
    const sourceUrl = `https://synthetic.jobmatch.invalid/r15/${runId}/server-invariants`
    const serverItem = { rawExternalId: `${runId}-server`, title: 'Synthetic server invariant offer', company: 'JobMatch Synthetic', location: 'Warszawa', sourceUrl, normalizedSourceUrl: sourceUrl, canonicalFingerprint: `r15:${runId}:server`, contentHash: `r15:${runId}:server`, offerData: { title: 'Synthetic server invariant offer', company: 'JobMatch Synthetic', location: 'Warszawa', sourceUrl } }
    const imported = await rpc('workspace_import_report', { payload: { sourceType: 'synthetic-smoke', fileName: `${runId}-server.json`, importedAt: now, parserVersion: 'r15-smoke-v1', idempotencyKey: `${runId}-server-import`, items: [serverItem], invalidItems: [], warnings: [] } })
    const offerId = uuid(imported.createdOfferIds[0])
    const { data: offer } = await client.from('job_offers').select('current_version_id').eq('id', offerId).maybeSingle()
    assert(offer?.current_version_id, 'R15_SMOKE_SERVER_OFFER_VERSION_REQUIRED')
    await rpc('workspace_persist_hard_filter_batch', { payload: { profile: profile.profile_data, profileHash: currentProfileVersion.content_hash, algorithmVersion: 'hf-r15-smoke', items: [{ jobOfferId: offerId, offerVersionId: offer.current_version_id, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] } })
    runServerWorkerInvariants(userId, offerId)
    console.log(JSON.stringify({ status: 'passed', providerCalls: 0, evidence: { syntheticScope: 'newly-imported', staleWorker: 'rejected', leaseReclaim: 'passed', idempotentComplete: 'one-version' } }))
    return
  }

  const sourceUrl = `https://synthetic.jobmatch.invalid/r15/${runId}`
  const item = { rawExternalId: `${runId}-offer`, title: 'Synthetic AI Queue Offer', company: 'JobMatch Synthetic', location: 'Warszawa', sourceUrl, normalizedSourceUrl: sourceUrl, canonicalFingerprint: `r15:${runId}`, contentHash: `r15:${runId}`, offerData: { title: 'Synthetic AI Queue Offer', company: 'JobMatch Synthetic', location: 'Warszawa', sourceUrl } }
  const imported = await rpc('workspace_import_report', { payload: { sourceType: 'synthetic-smoke', fileName: `${runId}.json`, importedAt: now, parserVersion: 'r15-smoke-v1', idempotencyKey: `${runId}-import`, items: [item], invalidItems: [], warnings: [] } })
  const offerId = uuid(imported.createdOfferIds[0])
  const { data: offer } = await client.from('job_offers').select('current_version_id').eq('id', offerId).maybeSingle()
  assert(offer?.current_version_id, 'R15_SMOKE_OFFER_VERSION_REQUIRED')
  await rpc('workspace_persist_hard_filter_batch', { payload: { profile: profile.profile_data, profileHash: currentProfileVersion.content_hash, algorithmVersion: 'hf-r15-smoke', items: [{ jobOfferId: offerId, offerVersionId: offer.current_version_id, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] } })

  const [first, duplicate] = await Promise.all([rpc('workspace_enqueue_analysis', { offer_id: offerId }), rpc('workspace_enqueue_analysis', { offer_id: offerId })])
  const queueId = uuid(first.queueItem.id)
  assert(queueId === duplicate.queueItem.id && (first.idempotent || duplicate.idempotent), 'R15_SMOKE_DUPLICATE_ENQUEUE_FAILED')
  const { data: firstQueue } = await client.from('analysis_queue').select('id,status').eq('id', queueId).maybeSingle()
  assert(firstQueue?.status === 'queued', 'R15_SMOKE_QUEUE_NOT_QUEUED')
  const { data: selectedState } = await client.from('offer_user_state').select('lifecycle_status').eq('job_offer_id', offerId).maybeSingle()
  assert(selectedState?.lifecycle_status === 'selected_for_analysis', 'R15_SMOKE_NOT_SELECTED_FOR_ANALYSIS')

  if (process.argv.includes('--replay-only')) {
    const responseSourceRows = dbQuery(`${serviceContext}
select q.provider_response_id
from public.analysis_queue q
join public.job_offers o on o.id = q.job_offer_id and o.user_id = q.user_id
where q.user_id = ${quote(userId)}::uuid
  and q.status = 'completed'
  and q.provider_response_id is not null
  and o.normalized_source_url like 'https://synthetic.jobmatch.invalid/r15/%'
order by q.completed_at desc
limit 1;`)
    const reusableResponseId = responseSourceRows[0]?.provider_response_id
    assert(typeof reusableResponseId === 'string' && reusableResponseId.length > 0, 'R15_SMOKE_REPLAY_SOURCE_REQUIRED')
    const replayRows = dbQuery(`${serviceContext}
update public.analysis_queue q set provider_response_id = ${quote(reusableResponseId)}, updated_at = now()
where q.id = ${quote(queueId)}::uuid and q.user_id = ${quote(userId)}::uuid and q.status = 'queued'
returning q.id as queue_id;`)
    assert(replayRows.length === 1, 'R15_SMOKE_REPLAY_RECEIPT_NOT_SET')
  }
  const { data: edgeResult, error: edgeError } = await client.functions.invoke('analyze-job-match', { body: { queueItemId: queueId } })
  if (edgeError || edgeResult?.status !== 'completed') throw new Error(`R15_SMOKE_EDGE_FAILED:${edgeResult?.code ?? await safeFunctionErrorCode(edgeError)}`)
  const { data: completedQueue } = await client.from('analysis_queue').select('status,provider_response_id,attempt_count').eq('id', queueId).maybeSingle()
  const { data: versions } = await client.from('analysis_versions').select('id,profile_version_id').eq('queue_item_id', queueId)
  assert(completedQueue?.status === 'completed' && completedQueue.provider_response_id && versions?.length === 1, 'R15_SMOKE_COMPLETE_OR_VERSION_FAILED')
  const initialVersionId = uuid(versions[0]?.id)
  const { data: analyzedState } = await client.from('offer_user_state').select('lifecycle_status').eq('job_offer_id', offerId).maybeSingle()
  assert(analyzedState?.lifecycle_status === 'analyzed', 'R15_SMOKE_NOT_ANALYZED')
  const { data: repeatedProcessorResult, error: repeatedProcessorError } = await client.functions.invoke('analyze-job-match', { body: { queueItemId: queueId } })
  const { data: versionsAfterRepeat } = await client.from('analysis_versions').select('id').eq('queue_item_id', queueId)
  assert(!repeatedProcessorError && repeatedProcessorResult?.status === 'completed' && repeatedProcessorResult?.reused === true && versionsAfterRepeat?.length === 1, 'R15_SMOKE_IDEMPOTENT_COMPLETE_FAILED')

  const restoredClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: restoredSignInError } = await restoredClient.auth.signInWithPassword({ email: process.env.WORKSPACE_SMOKE_EMAIL, password: process.env.WORKSPACE_SMOKE_PASSWORD })
  if (restoredSignInError) throw new Error(`R15_SMOKE_RESTORE_SIGN_IN_FAILED:${restoredSignInError.code ?? 'UNKNOWN'}`)
  const { data: restoredAnalysis } = await restoredClient.from('workspace_job_analyses').select('latest_version_id').eq('job_offer_id', offerId).maybeSingle()
  assert(restoredAnalysis?.latest_version_id === initialVersionId, 'R15_SMOKE_RESTORE_ANALYSIS_FAILED')

  const foreignRead = await secondClient.from('analysis_queue').select('id').eq('id', queueId)
  const foreignMutation = await secondClient.from('analysis_queue').update({ status: 'cancelled' }).eq('id', queueId).select('id')
  assert(!foreignRead.error && foreignRead.data?.length === 0 && Boolean(foreignMutation.error), 'R15_SMOKE_RLS_QUEUE_FAILED')

  const fakeAnalysis = quote(JSON.stringify({ offerId, overallScore: 50 }))
  const serverRows = dbQuery(`${serviceContext}
do $$
declare q uuid; token_one text; token_two text; complete_one jsonb; complete_two jsonb; version_count integer;
begin
  -- A normal enqueue may deliberately return the already completed queue for
  -- an identical analysis identity. Force a fresh synthetic reanalysis so the
  -- worker-token guard is exercised on an actual processing item.
  q := ((public.workspace_reanalyze_analysis(${quote(offerId)}) -> 'queueItem' ->> 'id'))::uuid;
  token_one := (public.workspace_claim_analysis(q) -> 'queueItem' ->> 'worker_token');
  begin
    perform public.workspace_complete_analysis(q, 'stale-token', ${fakeAnalysis}::jsonb, 'test-model', 'test-prompt', 'test-algorithm', 'fixture', null);
    raise exception 'R15_SMOKE_STALE_TOKEN_ACCEPTED';
  exception when others then
    if sqlerrm like '%R15_SMOKE_STALE_TOKEN_ACCEPTED%' then raise; end if;
  end;
  update public.analysis_queue set lease_expires_at = now() - interval '1 second' where id = q;
  token_two := (public.workspace_claim_analysis(q) -> 'queueItem' ->> 'worker_token');
  if token_one is null or token_two is null or token_one = token_two then raise exception 'R15_SMOKE_LEASE_RECLAIM_FAILED'; end if;
  complete_one := public.workspace_complete_analysis(q, token_two, ${fakeAnalysis}::jsonb, 'test-model', 'test-prompt', 'test-algorithm', 'fixture', null);
  complete_two := public.workspace_complete_analysis(q, token_two, ${fakeAnalysis}::jsonb, 'test-model', 'test-prompt', 'test-algorithm', 'fixture', null);
  select count(*) into version_count from public.analysis_versions where queue_item_id = q;
  if coalesce(complete_two ->> 'idempotent', 'false') <> 'true' or version_count <> 1 then raise exception 'R15_SMOKE_IDEMPOTENT_COMPLETE_RPC_FAILED'; end if;
end $$;
select 'server-invariants-passed' as result;`)
  assert(serverRows[0]?.result === 'server-invariants-passed', 'R15_SMOKE_SERVER_INVARIANTS_FAILED')

  const responseId = String(completedQueue.provider_response_id)
  const cacheSourceUrl = `https://synthetic.jobmatch.invalid/r15/${runId}/cached-response`
  const cachedImported = await rpc('workspace_import_report', { payload: { sourceType: 'synthetic-smoke', fileName: `${runId}-cached.json`, importedAt: now, parserVersion: 'r15-smoke-v1', idempotencyKey: `${runId}-cached-import`, items: [{ ...item, rawExternalId: `${runId}-cached-offer`, sourceUrl: cacheSourceUrl, normalizedSourceUrl: cacheSourceUrl, canonicalFingerprint: `r15:${runId}:cached`, contentHash: `r15:${runId}:cached`, offerData: { ...item.offerData, sourceUrl: cacheSourceUrl } }], invalidItems: [], warnings: [] } })
  const cachedOfferId = uuid(cachedImported.createdOfferIds[0])
  const { data: cachedOffer } = await client.from('job_offers').select('current_version_id').eq('id', cachedOfferId).maybeSingle()
  assert(cachedOffer?.current_version_id, 'R15_SMOKE_CACHED_OFFER_VERSION_REQUIRED')
  await rpc('workspace_persist_hard_filter_batch', { payload: { profile: profile.profile_data, profileHash: currentProfileVersion.content_hash, algorithmVersion: 'hf-r15-smoke', items: [{ jobOfferId: cachedOfferId, offerVersionId: cachedOffer.current_version_id, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] } })
  const cachedEnqueue = await rpc('workspace_enqueue_analysis', { offer_id: cachedOfferId })
  const cacheRows = dbQuery(`${serviceContext}
update public.analysis_queue q set provider_response_id = ${quote(responseId)}, updated_at = now() where q.id = ${quote(uuid(cachedEnqueue.queueItem.id))}::uuid and q.status = 'queued' returning q.id as queue_id;`)
  const cachedQueueId = uuid(cacheRows[0]?.queue_id)
  const { data: cachedEdge, error: cachedEdgeError } = await client.functions.invoke('analyze-job-match', { body: { queueItemId: cachedQueueId } })
  if (cachedEdgeError || cachedEdge?.status !== 'completed') throw new Error(`R15_SMOKE_PROVIDER_REUSE_FAILED:${cachedEdge?.code ?? await safeFunctionErrorCode(cachedEdgeError)}`)
  const { data: cachedQueue } = await client.from('analysis_queue').select('status,provider_response_id,attempt_count').eq('id', cachedQueueId).maybeSingle()
  if (!(cachedQueue?.status === 'completed' && cachedQueue.provider_response_id === responseId && cachedQueue.attempt_count === 0)) {
    throw new Error(`R15_SMOKE_PROVIDER_REUSE_STATE_FAILED:status=${cachedQueue?.status ?? 'missing'}:responseMatches=${cachedQueue?.provider_response_id === responseId}:attempts=${cachedQueue?.attempt_count ?? 'missing'}`)
  }

  const changedProfile = { ...profile.profile_data, additionalMustHave: `${String(profile.profile_data.additionalMustHave ?? '')} R15 smoke ${runId}` }
  await rpc('workspace_persist_hard_filter_batch', { payload: { profile: changedProfile, profileHash: `r15-profile-${runId}`, algorithmVersion: 'hf-r15-smoke', items: [{ jobOfferId: cachedOfferId, offerVersionId: cachedOffer.current_version_id, status: 'pass', reasons: [], missingInformation: [], checkedCriteria: [] }] } })
  const { data: profileAfterChange } = await client.from('profiles').select('current_version_id').maybeSingle()
  assert(profileAfterChange?.current_version_id && profileAfterChange.current_version_id !== versions[0]?.profile_version_id, 'R15_SMOKE_STALE_PROFILE_NOT_CREATED')

  const reanalysis = await rpc('workspace_enqueue_analysis', { offer_id: offerId })
  assert(reanalysis.queueItem.request_type === 'reanalysis' && reanalysis.queueItem.status === 'queued', 'R15_SMOKE_REANALYSIS_NOT_QUEUED')
  const reanalysisRows = dbQuery(`${serviceContext}
update public.analysis_queue q set provider_response_id = ${quote(responseId)}, updated_at = now() where q.id = ${quote(uuid(reanalysis.queueItem.id))}::uuid and q.status = 'queued' returning q.id as queue_id;`)
  assert(reanalysisRows.length === 1, 'R15_SMOKE_REANALYSIS_RECEIPT_NOT_SET')
  const { data: reanalysisEdge, error: reanalysisEdgeError } = await client.functions.invoke('analyze-job-match', { body: { queueItemId: reanalysis.queueItem.id } })
  if (reanalysisEdgeError || reanalysisEdge?.status !== 'completed') throw new Error(`R15_SMOKE_REANALYSIS_FAILED:${reanalysisEdge?.code ?? await safeFunctionErrorCode(reanalysisEdgeError)}`)
  const { data: reanalysisVersions } = await client.from('analysis_versions').select('id').eq('job_offer_id', offerId)
  const reloadedClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: reloadedSignInError } = await reloadedClient.auth.signInWithPassword({ email: process.env.WORKSPACE_SMOKE_EMAIL, password: process.env.WORKSPACE_SMOKE_PASSWORD })
  if (reloadedSignInError) throw new Error(`R15_SMOKE_REANALYSIS_RELOAD_SIGN_IN_FAILED:${reloadedSignInError.code ?? 'UNKNOWN'}`)
  const { data: refreshedAnalysis } = await reloadedClient.from('workspace_job_analyses').select('latest_version_id').eq('job_offer_id', offerId).maybeSingle()
  assert((reanalysisVersions?.length ?? 0) >= 2 && reanalysisVersions.some((version) => version.id === initialVersionId) && refreshedAnalysis?.latest_version_id !== initialVersionId, 'R15_SMOKE_REANALYSIS_HISTORY_FAILED')
  await reloadedClient.auth.signOut()

  const failSourceUrl = `https://synthetic.jobmatch.invalid/r15/${runId}/hf-fail`
  const failedImported = await rpc('workspace_import_report', { payload: { sourceType: 'synthetic-smoke', fileName: `${runId}-hf-fail.json`, importedAt: now, parserVersion: 'r15-smoke-v1', idempotencyKey: `${runId}-hf-fail-import`, items: [{ ...item, rawExternalId: `${runId}-hf-fail-offer`, sourceUrl: failSourceUrl, normalizedSourceUrl: failSourceUrl, canonicalFingerprint: `r15:${runId}:hf-fail`, contentHash: `r15:${runId}:hf-fail`, offerData: { ...item.offerData, sourceUrl: failSourceUrl } }], invalidItems: [], warnings: [] } })
  const failedOfferId = uuid(failedImported.createdOfferIds[0])
  const { data: failedOffer } = await client.from('job_offers').select('current_version_id').eq('id', failedOfferId).maybeSingle()
  assert(failedOffer?.current_version_id, 'R15_SMOKE_FAILED_OFFER_VERSION_REQUIRED')
  await rpc('workspace_persist_hard_filter_batch', { payload: { profile: changedProfile, profileHash: `r15-profile-${runId}`, algorithmVersion: 'hf-r15-smoke', items: [{ jobOfferId: failedOfferId, offerVersionId: failedOffer.current_version_id, status: 'fail', reasons: [], missingInformation: [], checkedCriteria: [] }] } })
  let hardFilterBlocked = false
  try { await rpc('workspace_enqueue_analysis', { offer_id: failedOfferId }) } catch (error) { hardFilterBlocked = String(error).includes('WORKSPACE_ANALYSIS_BLOCKED_BY_HARD_FILTER') }
  assert(hardFilterBlocked, 'R15_SMOKE_HARD_FILTER_NOT_BLOCKED')

  console.log(JSON.stringify({ status: 'passed', providerCalls: process.argv.includes('--replay-only') ? 0 : 1, providerResponseReuses: 2, evidence: { authenticatedQueue: 'completed', selectedForAnalysis: 'passed', restoredAnalysis: 'passed', duplicateEnqueue: 'one-active-item', rls: 'passed', leaseReclaim: 'passed', staleWorker: 'rejected', idempotentComplete: 'one-version', providerResponseReuse: 'completed-with-existing-response', staleProfile: 'passed', reanalysis: 'new-version-history-preserved', hardFilterFail: 'blocked' } }))
  await restoredClient.auth.signOut()
}

try { await main() } finally { await client.auth.signOut(); await secondClient.auth.signOut() }

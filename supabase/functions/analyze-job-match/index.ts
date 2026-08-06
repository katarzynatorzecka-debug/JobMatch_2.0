import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isAnalysisOutput, jobAnalysisOutputJsonSchema } from '../_shared/jobAnalysisOutputSchema.ts'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const model = 'gpt-5.4-mini'
const promptVersion = 'jobmatch-job-match-v1'
const algorithmVersion = 'jobmatch-deterministic-r1'
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: string, status: number, diagnostics: Record<string, unknown> = {}) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status, ...diagnostics })); return response({ code, error: code }, status) }
const categories = ['experience', 'skills', 'preferences', 'growth'] as const
const outcomePercent: Record<string, number | null> = { MATCH: 100, PARTIAL: 60, NO_MATCH: 0, UNKNOWN: null }
function validPriorities(value: unknown): value is string[] {
  const allowed = ['experience', 'skills', 'preferences', 'growth']
  return Array.isArray(value) && value.length === 4 && new Set(value).size === 4 && value.every((item) => typeof item === 'string' && allowed.includes(item))
}
function deterministicScore(profile: Record<string, unknown>, criteria: Record<string, { outcome: string; rationale: string; confidence: number }>) {
  const priority = profile.priorities as string[]
  const weightsByRank = [35, 30, 20, 15]
  const weights = Object.fromEntries(priority.map((category, index) => [category, weightsByRank[index]]))
  const scored = priority.filter((category) => outcomePercent[criteria[category]?.outcome] !== null)
  const scoredWeight = scored.reduce((total, category) => total + Number(weights[category] ?? 0), 0)
  const score = scoredWeight ? Math.round(scored.reduce((total, category) => total + Number(weights[category] ?? 0) * Number(outcomePercent[criteria[category].outcome] ?? 0), 0) / scoredWeight) : 0
  const confidenceValues = scored.map((category) => criteria[category].confidence).filter((value) => Number.isInteger(value) && value >= 0 && value <= 100)
  const criterionConfidence = confidenceValues.length === scored.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length) : null
  const reliability = scoredWeight < 75 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  return { score, weights, coverage: scoredWeight, criterionConfidence, reliability, scoredCategories: scored }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return failure('METHOD_NOT_ALLOWED', 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return failure('AUTH_REQUIRED', 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!serviceKey) return failure('WORKER_NOT_CONFIGURED', 503)
  if (!apiKey) return failure('OPENAI_NOT_CONFIGURED', 503)
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await userClient.auth.getUser()
  if (!auth.user) return failure('AUTH_INVALID', 401)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return failure('REQUEST_INVALID', 400) }
  const queueItemId = typeof body.queueItemId === 'string' ? body.queueItemId : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(queueItemId)) return failure('QUEUE_ITEM_REQUIRED', 400)
  const { data: ownedItem, error: ownershipError } = await userClient.from('analysis_queue').select('id,user_id').eq('id', queueItemId).maybeSingle()
  if (ownershipError || !ownedItem || ownedItem.user_id !== auth.user.id) return failure('QUEUE_ITEM_NOT_FOUND', 404)
  const worker = createClient(url, serviceKey, { global: { headers: { Authorization: `Bearer ${serviceKey}` } } })
  const { data: claim, error: claimError } = await worker.rpc('workspace_claim_analysis', { queue_item_id: queueItemId })
  if (claimError) {
    const code = claimError.message.includes('WORKSPACE_WORKER_FORBIDDEN') ? 'WORKSPACE_WORKER_FORBIDDEN' : claimError.message.includes('permission denied') ? 'WORKSPACE_WORKER_PERMISSION_DENIED' : 'QUEUE_CLAIM_FAILED'
    console.info(JSON.stringify({ diagnostic: code, databaseCode: claimError.code ?? null }))
    return failure(code, 409)
  }
  if (!claim || typeof claim !== 'object') return failure('QUEUE_NOT_CLAIMABLE', 409)
  const work = claim as Record<string, unknown>
  const queueItem = work.queueItem as Record<string, unknown> | undefined
  const profile = work.profile as Record<string, unknown> | undefined
  const offer = work.offer as Record<string, unknown> | undefined
  const hardFilter = work.hardFilter as Record<string, unknown> | undefined
  const workerToken = typeof queueItem?.worker_token === 'string' ? queueItem.worker_token : ''
  if (!queueItem || !profile || !offer || !hardFilter || !workerToken) return failure('WORKSPACE_ANALYSIS_CONTEXT_INVALID', 409)
  const failQueue = async (code: string) => { await worker.rpc('workspace_fail_analysis', { queue_item_id: queueItemId, worker_token: workerToken, error_code: code }); return failure(code, 502) }
  if (!validPriorities(profile.priorities)) return await failQueue('WORKSPACE_PROFILE_PRIORITIES_INVALID')
  const sourceQuality = 'partial'
  const prompt = `Oceń dopasowanie kandydata do oferty pracy, nie atrakcyjność firmy. Nie wymyślaj faktów. Zwróć niezależny werdykt MATCH, PARTIAL, NO_MATCH albo UNKNOWN dla każdego z czterech kryteriów oraz krótkie dowody i pewność. UNKNOWN oznacza brak danych i nie jest porażką. Nie licz końcowego score ani nie wydawaj rekomendacji. Uwzględnij braki w missingInformation. Hard Filter jest niezależny i wiążący.\nProfil: ${JSON.stringify(profile)}\nOferta znormalizowana: ${JSON.stringify(offer)}\nHard Filter: ${JSON.stringify(hardFilter)}`
  const existingProviderResponseId = typeof queueItem.provider_response_id === 'string' ? queueItem.provider_response_id : null
  let openAiResponse: Response
  try {
    openAiResponse = existingProviderResponseId
      ? await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(existingProviderResponseId)}`, { headers: { Authorization: `Bearer ${apiKey}` } })
      : await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': queueItemId }, body: JSON.stringify({ model, reasoning: { effort: 'low' }, input: prompt, text: { format: { type: 'json_schema', name: 'job_match', strict: true, schema: jobAnalysisOutputJsonSchema } } }) })
  } catch { return await failQueue(existingProviderResponseId ? 'OPENAI_RESPONSE_RETRIEVE_ERROR' : 'OPENAI_NETWORK_ERROR') }
  if (!openAiResponse.ok) { console.info(JSON.stringify({ diagnostic: 'OPENAI_HTTP_ERROR', providerStatus: openAiResponse.status })); return await failQueue(existingProviderResponseId ? 'OPENAI_RESPONSE_RETRIEVE_ERROR' : 'OPENAI_HTTP_ERROR') }
  let payload: unknown
  try { payload = await openAiResponse.json() } catch { return await failQueue('OPENAI_SCHEMA_MISMATCH') }
  const providerResponseId = typeof (payload as Record<string, unknown> | null)?.id === 'string' ? (payload as Record<string, unknown>).id as string : existingProviderResponseId
  if (!providerResponseId) return await failQueue('OPENAI_EMPTY_OUTPUT')
  if (!existingProviderResponseId) {
    const { error: receiptError } = await worker.rpc('workspace_record_provider_response', { p_queue_item_id: queueItemId, p_worker_token: workerToken, p_provider_response_id: providerResponseId })
    if (receiptError) return await failQueue('ANALYSIS_PROVIDER_RECEIPT_SAVE_FAILED')
  }
  const parsed = readOpenAiStructuredOutput(payload)
  if (!parsed.ok) { console.info(JSON.stringify({ diagnostic: parsed.code, ...parsed.diagnostics })); return await failQueue(parsed.code) }
  if (!isAnalysisOutput(parsed.value)) return await failQueue('OPENAI_SCHEMA_MISMATCH')
  const scoring = deterministicScore(profile, parsed.value.criteria)
  const analysisHardFilterStatus = hardFilter.status === 'needs_review' ? 'weak' : hardFilter.status === 'fail' ? 'fail' : 'pass'
  const finalAnalysis = {
    ...parsed.value,
    offerId: queueItem.job_offer_id,
    overallScore: scoring.score,
    categoryScores: Object.fromEntries(categories.map((category) => [category, { score: outcomePercent[parsed.value.criteria[category].outcome], rationale: parsed.value.criteria[category].rationale }])),
    recommendation: analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję' : scoring.score >= 75 && scoring.coverage >= 75 && scoring.reliability === 'standard' ? 'Warto aplikować' : scoring.score >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję',
    hardFilterStatus: analysisHardFilterStatus,
    hardFilterReasons: Array.isArray(hardFilter.reasons) ? hardFilter.reasons.map((reason) => typeof reason === 'object' && reason ? (reason as Record<string, unknown>).label : '').filter((label): label is string => typeof label === 'string') : [],
    sourceQuality,
    modelInfo: { provider: 'openai', model, provisional: true },
    createdAt: new Date().toISOString(),
    status: 'ready',
    scoring: { algorithmVersion, weights: scoring.weights, coverage: scoring.coverage, criterionConfidence: scoring.criterionConfidence, reliability: scoring.reliability, scoredCategories: scoring.scoredCategories },
  }
  const { data: completed, error: completeError } = await worker.rpc('workspace_complete_analysis', { queue_item_id: queueItemId, worker_token: workerToken, analysis_data: finalAnalysis, model_version: model, prompt_version: promptVersion, algorithm_version: algorithmVersion, source_quality: sourceQuality, provider_request_id: providerResponseId })
  if (completeError || !completed) return failure('ANALYSIS_SAVE_FAILED', 502)
  console.info(JSON.stringify({ diagnostic: 'OPENAI_SUCCESS', queueItemId, requestId: openAiResponse.headers.get('x-request-id'), responseId: providerResponseId, outputTypes: parsed.diagnostics.outputTypes, contentTypes: parsed.diagnostics.contentTypes, validation: 'passed' }))
  return response({ status: 'completed', queueItemId })
})

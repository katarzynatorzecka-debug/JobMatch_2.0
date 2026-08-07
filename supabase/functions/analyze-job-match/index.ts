import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isAnalysisOutput, jobAnalysisOutputJsonSchema } from '../_shared/jobAnalysisOutputSchema.ts'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const model = 'gpt-5.4-mini'
const promptVersion = 'jobmatch-job-match-v1'
const algorithmVersion = 'jobmatch-deterministic-r3'
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: string, status: number, diagnostics: Record<string, unknown> = {}) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status, ...diagnostics })); return response({ code, error: code }, status) }
const categories = ['experience', 'skills', 'preferences', 'growth'] as const
const outcomePercent: Record<string, number> = { MATCH: 100, PARTIAL: 60, NO_MATCH: 0, UNKNOWN: 50 }
function validPriorities(value: unknown): value is string[] {
  const allowed = ['experience', 'skills', 'preferences', 'growth']
  return Array.isArray(value) && value.length === 4 && new Set(value).size === 4 && value.every((item) => typeof item === 'string' && allowed.includes(item))
}
function deterministicScore(profile: Record<string, unknown>, criteria: Record<string, Array<{ outcome: string; confidence: number }>>) {
  const priority = categories
  const weightsByRank = [35, 30, 25, 10]
  const weights = Object.fromEntries(priority.map((category, index) => [category, weightsByRank[index]]))
  const entries = categories.flatMap((category) => (criteria[category] ?? []).map((criterion) => ({ category, criterion, weight: Number(weights[category] ?? 0) / Math.max(1, criteria[category]?.length ?? 1) })))
  const known = entries.filter(({ criterion }) => criterion.outcome !== 'UNKNOWN')
  const scoredWeight = known.reduce((total, entry) => total + entry.weight, 0)
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0)
  const score = totalWeight ? Math.round(entries.reduce((total, entry) => total + entry.weight * Number(outcomePercent[entry.criterion.outcome]), 0) / totalWeight) : 0
  const confidenceValues = known.filter(({ criterion }) => Number.isInteger(criterion.confidence) && criterion.confidence >= 0 && criterion.confidence <= 100)
  const criterionConfidence = confidenceValues.length === known.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, entry) => total + entry.weight * entry.criterion.confidence, 0) / scoredWeight) : null
  const reliability = scoredWeight < 85 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  const categoryScores = Object.fromEntries(categories.map((category) => {
    const categoryKnown = criteria[category] ?? []
    return [category, categoryKnown.length ? Math.round(categoryKnown.reduce((total, criterion) => total + Number(outcomePercent[criterion.outcome]), 0) / categoryKnown.length) : null]
  }))
  return { score, weights, coverage: scoredWeight, criterionConfidence, reliability, scoredCategories: categories.filter((category) => (criteria[category] ?? []).some((criterion) => criterion.outcome !== 'UNKNOWN')), categoryScores, criterionCount: entries.length, knownCriterionCount: known.length, unknownCriterionCount: entries.length - known.length }
}

async function loadPublicOfferSource(supabaseUrl: string, authorization: string, offer: Record<string, unknown>) {
  const sourceUrl = typeof offer.sourceUrl === 'string' ? offer.sourceUrl : ''
  if (!sourceUrl) return { sourceQuality: 'partial', text: '', missingInformation: ['pełna treść oferty'] }
  try {
    const source = await fetch(`${supabaseUrl}/functions/v1/fetch-offer-page`, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId: typeof offer.id === 'string' ? offer.id : 'workspace-offer', sourceUrl, offer }) })
    if (!source.ok) return { sourceQuality: 'partial', text: '', missingInformation: ['pełna treść oferty'] }
    const data = await source.json() as Record<string, unknown>
    const description = typeof data.description === 'string' ? data.description : ''
    const requirements = Array.isArray(data.requirements) ? data.requirements.filter((item): item is string => typeof item === 'string') : []
    const responsibilities = Array.isArray(data.responsibilities) ? data.responsibilities.filter((item): item is string => typeof item === 'string') : []
    const benefits = Array.isArray(data.benefits) ? data.benefits.filter((item): item is string => typeof item === 'string') : []
    const text = [description, requirements.length ? `Wymagania: ${requirements.join('; ')}` : '', responsibilities.length ? `Zakres obowiązków: ${responsibilities.join('; ')}` : '', benefits.length ? `Benefity: ${benefits.join('; ')}` : ''].filter(Boolean).join('\n').slice(0, 18_000)
    return { sourceQuality: data.sourceQuality === 'full' && text ? 'full' : 'partial', text, missingInformation: Array.isArray(data.missingInformation) ? data.missingInformation.filter((item): item is string => typeof item === 'string') : [] }
  } catch { return { sourceQuality: 'partial', text: '', missingInformation: ['pełna treść oferty'] } }
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
  const { data: ownedItem, error: ownershipError } = await userClient.from('analysis_queue').select('id,user_id,status,provider_response_id').eq('id', queueItemId).maybeSingle()
  if (ownershipError || !ownedItem || ownedItem.user_id !== auth.user.id) return failure('QUEUE_ITEM_NOT_FOUND', 404)
  if (ownedItem.status === 'completed') return response({ status: 'completed', queueItemId, reused: true })
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
  const source = await loadPublicOfferSource(url, authorization, offer)
  const prompt = `Oceń dopasowanie kandydata do oferty pracy, nie atrakcyjność firmy. Nie wymyślaj faktów. Dla każdej kategorii zwróć listę kryteriów podrzędnych: requirement, profileEvidence, offerEvidence, MATCH/PARTIAL/NO_MATCH/UNKNOWN, confidence i rationale. MATCH wymaga co najmniej jednego konkretnego dowodu zarówno z profilu, jak i z oferty. Gdy dowodu brakuje, użyj UNKNOWN; UNKNOWN nie jest porażką. Nie licz końcowego score ani nie wydawaj rekomendacji. Nie traktuj must-have ani blacklisty jako części score lub coverage. Hard Filter jest niezależny i wiążący.\nProfil: ${JSON.stringify(profile)}\nOferta znormalizowana: ${JSON.stringify(offer)}\nPełna publiczna treść oferty (może być częściowa): ${source.text || 'Niedostępna'}\nHard Filter: ${JSON.stringify(hardFilter)}`
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
  if (categories.some((category) => parsed.value.criteria[category].some((criterion) => criterion.outcome === 'MATCH' && (!criterion.profileEvidence.length || !criterion.offerEvidence.length)))) return await failQueue('OPENAI_EVIDENCE_MISSING')
  const scoring = deterministicScore(profile, parsed.value.criteria)
  const analysisHardFilterStatus = hardFilter.status === 'needs_review' ? 'weak' : hardFilter.status === 'fail' ? 'fail' : 'pass'
  const finalAnalysis = {
    ...parsed.value,
    offerId: queueItem.job_offer_id,
    overallScore: scoring.score,
    categoryScores: Object.fromEntries(categories.map((category) => [category, { score: scoring.categoryScores[category], rationale: parsed.value.criteria[category].map((criterion) => criterion.rationale).join(' ') }])),
    recommendation: analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję' : scoring.score >= 75 && scoring.coverage >= 85 && scoring.reliability === 'standard' ? 'Warto aplikować' : scoring.score >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję',
    hardFilterStatus: analysisHardFilterStatus,
    hardFilterReasons: Array.isArray(hardFilter.reasons) ? hardFilter.reasons.map((reason) => typeof reason === 'object' && reason ? (reason as Record<string, unknown>).label : '').filter((label): label is string => typeof label === 'string') : [],
    sourceQuality: source.sourceQuality,
    modelInfo: { provider: 'openai', model, provisional: true },
    createdAt: new Date().toISOString(),
    status: 'ready',
    missingInformation: [...new Set([...parsed.value.missingInformation, ...source.missingInformation])],
    scoring: { algorithmVersion, weights: scoring.weights, coverage: scoring.coverage, criterionConfidence: scoring.criterionConfidence, reliability: scoring.reliability, scoredCategories: scoring.scoredCategories, criterionCount: scoring.criterionCount, knownCriterionCount: scoring.knownCriterionCount, unknownCriterionCount: scoring.unknownCriterionCount },
  }
  const { data: completed, error: completeError } = await worker.rpc('workspace_complete_analysis', { queue_item_id: queueItemId, worker_token: workerToken, analysis_data: finalAnalysis, model_version: model, prompt_version: promptVersion, algorithm_version: algorithmVersion, source_quality: source.sourceQuality, provider_request_id: providerResponseId })
  if (completeError || !completed) return failure('ANALYSIS_SAVE_FAILED', 502)
  console.info(JSON.stringify({ diagnostic: 'OPENAI_SUCCESS', queueItemId, requestId: openAiResponse.headers.get('x-request-id'), responseId: providerResponseId, outputTypes: parsed.diagnostics.outputTypes, contentTypes: parsed.diagnostics.contentTypes, validation: 'passed' }))
  return response({ status: 'completed', queueItemId })
})

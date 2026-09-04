import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isAnalysisOutput, jobAnalysisOutputJsonSchema } from '../_shared/jobAnalysisOutputSchema.ts'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'
import { buildAnalysisCandidateContext } from '../_shared/analysisCandidateContext.ts'
import { canonicalSourceHashInput, isManifestSufficientForAnalysis, manifestFromOfferIntelligenceRubric, outputMatchesManifest } from '../_shared/analysisCriteriaManifest.ts'
import { buildOfferIntelligencePrompt, buildOfferIntelligenceRubric, isOfferIntelligenceProviderOutput, isOfferIntelligenceRubric, isOfferIntelligenceRubricSufficient, offerIntelligenceJsonSchema, type OfferIntelligenceRubric, type OfferSourceSnapshot } from '../_shared/offerIntelligence.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const model = 'gpt-5.4-mini'
const promptVersion = 'jobmatch-job-match-v5'
const algorithmVersion = 'jobmatch-deterministic-r9'
const analysisContractVersion = 'jobmatch-analysis-contract-vnext-a'
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: string, status: number, diagnostics: Record<string, unknown> = {}) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status, ...diagnostics })); return response({ code, error: code }, status) }
const categories = ['experience', 'skills', 'preferences', 'growth'] as const
const outcomePercent: Record<string, number | null> = { MATCH: 100, PARTIAL: 60, NO_MATCH: 0, UNKNOWN: null }
function validPriorities(value: unknown): value is string[] {
  const allowed = ['experience', 'skills', 'preferences', 'growth']
  return Array.isArray(value) && value.length === 4 && new Set(value).size === 4 && value.every((item) => typeof item === 'string' && allowed.includes(item))
}
function deterministicScore(profile: Record<string, unknown>, rawCriteria: Record<string, Array<{ id: string; canonicalKey?: string; requirement: string; outcome: string; confidence: number; profileEvidence?: string[]; offerEvidence?: string[] }>>) {
  // `isAnalysisOutput` and the manifest check have already rejected duplicate,
  // unknown or renamed requirements. Never repair conflicts by preferring MATCH.
  const criteria = rawCriteria
  const priority = profile.priorities as typeof categories
  const weightsByRank = [35, 30, 20, 15]
  const weights = Object.fromEntries(priority.map((category, index) => [category, weightsByRank[index]]))
  const entries = categories.flatMap((category) => (criteria[category] ?? []).map((criterion) => ({ category, criterion, weight: Number(weights[category] ?? 0) / Math.max(1, criteria[category]?.length ?? 1) })))
  const known = entries.filter(({ criterion }) => criterion.outcome !== 'UNKNOWN')
  const scoredWeight = known.reduce((total, entry) => total + entry.weight, 0)
  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0)
  // UNKNOWN is visible through coverage and reliability, not treated as a
  // negative assessment in the deterministic score.
  const score = scoredWeight ? Math.round(known.reduce((total, entry) => total + entry.weight * Number(outcomePercent[entry.criterion.outcome] ?? 0), 0) / scoredWeight) : 0
  const confidenceValues = known.filter(({ criterion }) => Number.isInteger(criterion.confidence) && criterion.confidence >= 0 && criterion.confidence <= 100)
  // Confidence belongs to the classification and evidence of this exact
  // requirement. A global profile average would couple unrelated criteria.
  const criterionConfidence = confidenceValues.length === known.length && confidenceValues.length ? Math.round(confidenceValues.reduce((total, entry) => total + entry.weight * entry.criterion.confidence, 0) / scoredWeight) : null
  const coverage = totalWeight ? Math.round((scoredWeight / totalWeight) * 100) : 0
  const reliability = coverage < 75 || criterionConfidence === null || criterionConfidence < 60 ? 'limited' : 'standard'
  const categoryScores = Object.fromEntries(categories.map((category) => {
    const categoryKnown = criteria[category] ?? []
    const known = categoryKnown.filter((criterion) => criterion.outcome !== 'UNKNOWN')
    return [category, known.length ? Math.round(known.reduce((total, criterion) => total + Number(outcomePercent[criterion.outcome] ?? 0), 0) / known.length) : null]
  }))
  return { score, weights, coverage, criterionConfidence, reliability, scoredCategories: categories.filter((category) => (criteria[category] ?? []).some((criterion) => criterion.outcome !== 'UNKNOWN')), categoryScores, criterionCount: entries.length, knownCriterionCount: known.length, unknownCriterionCount: entries.length - known.length, criteria }
}

async function loadPublicOfferSource(supabaseUrl: string, authorization: string, offer: Record<string, unknown>) {
  const sourceUrl = typeof offer.sourceUrl === 'string' ? offer.sourceUrl : ''
  if (!sourceUrl) return { sourceQuality: 'partial' as const, text: '', requirements: [], responsibilities: [], benefits: [], missingInformation: ['pełna treść oferty'] }
  try {
    const source = await fetch(`${supabaseUrl}/functions/v1/fetch-offer-page`, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId: typeof offer.id === 'string' ? offer.id : 'workspace-offer', sourceUrl, offer }) })
    if (!source.ok) return { sourceQuality: 'partial' as const, text: '', requirements: [], responsibilities: [], benefits: [], missingInformation: ['pełna treść oferty'] }
    const data = await source.json() as Record<string, unknown>
    const description = typeof data.description === 'string' ? data.description : ''
    const requirements = Array.isArray(data.requirements) ? data.requirements.filter((item): item is string => typeof item === 'string') : []
    const responsibilities = Array.isArray(data.responsibilities) ? data.responsibilities.filter((item): item is string => typeof item === 'string') : []
    const benefits = Array.isArray(data.benefits) ? data.benefits.filter((item): item is string => typeof item === 'string') : []
    const text = description.slice(0, 18_000)
    return { sourceQuality: data.sourceQuality === 'full' && text ? 'full' as const : 'partial' as const, text, requirements, responsibilities, benefits, missingInformation: Array.isArray(data.missingInformation) ? data.missingInformation.filter((item): item is string => typeof item === 'string') : [] }
  } catch { return { sourceQuality: 'partial' as const, text: '', requirements: [], responsibilities: [], benefits: [], missingInformation: ['pełna treść oferty'] } }
}

function isOfferSourceSnapshot(value: unknown): value is OfferSourceSnapshot {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (data.sourceQuality === 'full' || data.sourceQuality === 'partial') && typeof data.text === 'string' && Array.isArray(data.missingInformation) && data.missingInformation.every((item) => typeof item === 'string')
    && ['requirements', 'responsibilities', 'benefits'].every((key) => data[key] === undefined || (Array.isArray(data[key]) && data[key].every((item) => typeof item === 'string')))
}

async function sha256Text(value: string) {
  const bytes = new TextEncoder().encode(value)
  const rawDigest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(rawDigest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function digest(value: unknown) { return await sha256Text(JSON.stringify(value)) }

async function sourceHash(source: OfferSourceSnapshot) { return await sha256Text(canonicalSourceHashInput(source)) }
async function contractHash(source: OfferSourceSnapshot, rubric: OfferIntelligenceRubric) {
  return await digest({ source, rubric, contractVersion: analysisContractVersion })
}

async function queueAnalysisIdentity(queueItem: Record<string, unknown>, nextContractHash: string) {
  return await sha256Text([
    String(queueItem.user_id ?? ''), String(queueItem.job_offer_id ?? ''), String(queueItem.offer_version_id ?? ''),
    String(queueItem.profile_version_id ?? ''), promptVersion, model, `${algorithmVersion}:${nextContractHash}`,
  ].join('|'))
}

async function loadOfferAnalysisContract(worker: ReturnType<typeof createClient>, userId: string, offerVersionId: string) {
  const { data, error } = await worker.from('offer_versions').select('analysis_source_snapshot,analysis_source_hash,analysis_criteria_manifest,analysis_contract_hash,analysis_contract_version').eq('id', offerVersionId).eq('user_id', userId).maybeSingle()
  if (error || !data) return { error: true as const, source: null, sourceHash: null, rubric: null, contractHash: null, contractVersion: null }
  return {
    error: false as const,
    source: isOfferSourceSnapshot(data.analysis_source_snapshot) ? { ...data.analysis_source_snapshot, requirements: data.analysis_source_snapshot.requirements ?? [], responsibilities: data.analysis_source_snapshot.responsibilities ?? [], benefits: data.analysis_source_snapshot.benefits ?? [] } : null,
    sourceHash: typeof data.analysis_source_hash === 'string' ? data.analysis_source_hash : null,
    rubric: isOfferIntelligenceRubric(data.analysis_criteria_manifest) ? data.analysis_criteria_manifest : null,
    contractHash: typeof data.analysis_contract_hash === 'string' ? data.analysis_contract_hash : null,
    contractVersion: typeof data.analysis_contract_version === 'string' ? data.analysis_contract_version : null,
  }
}

async function persistOfferAnalysisContract(worker: ReturnType<typeof createClient>, userId: string, offerVersionId: string, source: OfferSourceSnapshot, rubric: OfferIntelligenceRubric) {
  const nextSourceHash = await sourceHash(source)
  if (rubric.sourceSnapshotHash !== nextSourceHash) return { ok: false, contractHash: '' }
  const nextContractHash = await contractHash(source, rubric)
  const payload: Record<string, unknown> = { analysis_source_snapshot: source, analysis_source_hash: nextSourceHash, analysis_criteria_manifest: rubric, analysis_contract_hash: nextContractHash, analysis_contract_version: analysisContractVersion }
  const { error } = await worker.from('offer_versions').update(payload).eq('id', offerVersionId).eq('user_id', userId)
  return { ok: !error, contractHash: nextContractHash }
}

async function alignQueueAnalysisIdentity(worker: ReturnType<typeof createClient>, queueItem: Record<string, unknown>, workerToken: string, nextContractHash: string) {
  const identity = await queueAnalysisIdentity(queueItem, nextContractHash)
  const { error } = await worker.from('analysis_queue').update({ analysis_identity: identity }).eq('id', String(queueItem.id ?? '')).eq('user_id', String(queueItem.user_id ?? '')).eq('worker_token', workerToken)
  return !error
}

async function requestOpenAi(apiKey: string, input: string, schema: Record<string, unknown>, requestId: string) {
  return await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': requestId }, body: JSON.stringify({ model, reasoning: { effort: 'low' }, input, text: { format: { type: 'json_schema', name: 'job_match', strict: true, schema } } }) })
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
  const contract = await loadOfferAnalysisContract(worker, String(queueItem.user_id ?? ''), String(queueItem.offer_version_id ?? ''))
  if (contract.error) return await failQueue('WORKSPACE_ANALYSIS_CONTRACT_UNAVAILABLE')
  let source: OfferSourceSnapshot = contract.source ?? await loadPublicOfferSource(url, authorization, offer)
  let nextSourceHash = await sourceHash(source)
  let rubric: OfferIntelligenceRubric | null = contract.contractVersion === analysisContractVersion && contract.rubric?.sourceSnapshotHash === nextSourceHash ? contract.rubric : null
  if (!rubric && source.sourceQuality !== 'full' && contract.source) {
    const refreshedSource = await loadPublicOfferSource(url, authorization, offer)
    const refreshedHash = await sourceHash(refreshedSource)
    if (refreshedSource.sourceQuality === 'full') { source = refreshedSource; nextSourceHash = refreshedHash }
  }
  if (!rubric) {
    if (source.sourceQuality !== 'full' || !source.text) return await failQueue('WORKSPACE_ANALYSIS_SOURCE_INCOMPLETE')
    let intelligenceResponse: Response
    try { intelligenceResponse = await requestOpenAi(apiKey, buildOfferIntelligencePrompt(source, nextSourceHash), offerIntelligenceJsonSchema as unknown as Record<string, unknown>, `${queueItemId}:offer-intelligence`) } catch { return await failQueue('OPENAI_OFFER_INTELLIGENCE_NETWORK_ERROR') }
    if (!intelligenceResponse.ok) { console.info(JSON.stringify({ diagnostic: 'OPENAI_OFFER_INTELLIGENCE_HTTP_ERROR', providerStatus: intelligenceResponse.status })); return await failQueue('OPENAI_OFFER_INTELLIGENCE_HTTP_ERROR') }
    let intelligencePayload: unknown
    try { intelligencePayload = await intelligenceResponse.json() } catch { return await failQueue('OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH') }
    const parsedIntelligence = readOpenAiStructuredOutput(intelligencePayload)
    if (!parsedIntelligence.ok || !isOfferIntelligenceProviderOutput(parsedIntelligence.value, source)) return await failQueue('OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH')
    rubric = buildOfferIntelligenceRubric(source, nextSourceHash, parsedIntelligence.value)
    if (!rubric) return await failQueue('OPENAI_OFFER_INTELLIGENCE_CONTRACT_INVALID')
  }
  const manifest = manifestFromOfferIntelligenceRubric(rubric)
  const persistedContract = contract.contractVersion === analysisContractVersion && contract.contractHash && contract.source && contract.sourceHash === nextSourceHash && contract.rubric?.sourceSnapshotHash === nextSourceHash
    ? { ok: true, contractHash: contract.contractHash }
    : await persistOfferAnalysisContract(worker, String(queueItem.user_id ?? ''), String(queueItem.offer_version_id ?? ''), source, rubric)
  if (!persistedContract.ok) return await failQueue('WORKSPACE_ANALYSIS_CONTRACT_SAVE_FAILED')
  if (!await alignQueueAnalysisIdentity(worker, queueItem, workerToken, persistedContract.contractHash)) return await failQueue('WORKSPACE_ANALYSIS_IDENTITY_SAVE_FAILED')
  if (!isOfferIntelligenceRubricSufficient(rubric) || !isManifestSufficientForAnalysis(manifest)) return await failQueue('WORKSPACE_ANALYSIS_RUBRIC_INSUFFICIENT')
  const candidateContext = buildAnalysisCandidateContext(profile, `${JSON.stringify(offer)}\n${source.text}`)
  const manifestInstruction = `Użyj dokładnie poniższego, trwałego zestawu wymagań oferty. Nie dodawaj, nie usuwaj, nie zmieniaj kategorii, id, canonicalKey ani requirement; uzupełnij wyłącznie outcome, dowody, confidence i rationale.\nManifest: ${JSON.stringify(manifest)}`
  const prompt = `Oceń dopasowanie kandydata do oferty pracy, nie atrakcyjność firmy. Nie wymyślaj faktów. ${manifestInstruction} Każda pozycja manifestu jest jawnym wymaganiem oferty i musi mieć offerEvidence. MATCH oznacza, że konkretny dowód z profilu spełnia wymaganie. PARTIAL oznacza częściowy lub transferowalny dowód z profilu. NO_MATCH oznacza, że wymaganie jest jasne, ale pełny przekazany kontekst kandydata nie zawiera wspierającego dowodu albo zawiera dowód sprzeczny; sam brak wzmianki w profilu nie jest UNKNOWN. Opisuj NO_MATCH jako brak potwierdzenia w profilu, nie jako pewność, że kandydat nie posiada kompetencji. UNKNOWN stosuj wyłącznie wtedy, gdy mimo manifestu nie da się jednoznacznie zrozumieć wymagania albo przekazany kontekst kandydata jest technicznie niewystarczający do klasyfikacji. MATCH i PARTIAL wymagają profileEvidence oraz offerEvidence. NO_MATCH wymaga offerEvidence, a profileEvidence może być puste. Skills, experience areas i responsibilities mogą być dowodami tego samego kryterium, lecz nie osobnymi punktami. Career target nie jest doświadczeniem. Nie licz końcowego score ani rekomendacji. Must-have i blacklist są poza score i coverage; Hard Filter jest niezależny i wiążący.\nKontekst kandydata: ${JSON.stringify(candidateContext)}\nOferta znormalizowana: ${JSON.stringify(offer)}\nTrwały snapshot publicznej treści oferty: ${source.text || 'Niedostępna'}\nHard Filter: ${JSON.stringify(hardFilter)}`
  const existingProviderResponseId = typeof queueItem.provider_response_id === 'string' ? queueItem.provider_response_id : null
  let openAiResponse: Response
  try {
    openAiResponse = existingProviderResponseId
      ? await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(existingProviderResponseId)}`, { headers: { Authorization: `Bearer ${apiKey}` } })
      : await requestOpenAi(apiKey, prompt, jobAnalysisOutputJsonSchema as unknown as Record<string, unknown>, queueItemId)
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
  if (!outputMatchesManifest(parsed.value.criteria, manifest)) return await failQueue('OPENAI_CRITERIA_MANIFEST_MISMATCH')
  if (categories.some((category) => parsed.value.criteria[category].some((criterion) => !criterion.offerEvidence.length))) return await failQueue('OPENAI_OFFER_EVIDENCE_MISSING')
  if (categories.some((category) => parsed.value.criteria[category].some((criterion) => (criterion.outcome === 'MATCH' || criterion.outcome === 'PARTIAL') && !criterion.profileEvidence.length))) return await failQueue('OPENAI_PROFILE_EVIDENCE_MISSING')
  const scoring = deterministicScore(profile, parsed.value.criteria)
  const analysisHardFilterStatus = hardFilter.status === 'needs_review' ? 'weak' : hardFilter.status === 'fail' ? 'fail' : 'pass'
  const finalAnalysis = {
    ...parsed.value,
    criteria: scoring.criteria,
    offerId: queueItem.job_offer_id,
    overallScore: scoring.score,
    categoryScores: Object.fromEntries(categories.map((category) => [category, { score: scoring.categoryScores[category], rationale: scoring.criteria[category].map((criterion) => criterion.rationale).join(' ') }])),
    recommendation: analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję' : scoring.score >= 75 && scoring.coverage >= 75 && scoring.reliability === 'standard' ? 'Warto aplikować' : scoring.score >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję',
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

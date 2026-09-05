import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isAnalysisOutput } from '../_shared/jobAnalysisOutputSchema.ts'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'
import { buildAnalysisCandidateContext } from '../_shared/analysisCandidateContext.ts'
import { canonicalSourceHashInput, isManifestSufficientForAnalysis, manifestFromOfferIntelligenceRubric, outputMatchesManifest } from '../_shared/analysisCriteriaManifest.ts'
import { hasRunnableOfferSourceContent } from '../_shared/offerSourceNormalizer.ts'
import { normalizeRocketJobsSourceUrl } from '../_shared/rocketJobsSourceUrl.ts'
import { buildOfferIntelligencePrompt, buildOfferIntelligenceRubric, isOfferIntelligenceProviderOutput, isOfferIntelligenceRubric, isOfferIntelligenceRubricRunnable, offerIntelligenceRequestSchemas, offerIntelligenceProviderValidationDiagnostic, shouldRefreshOfferSourceSnapshot, type OfferIntelligenceRubric, type OfferSourceSnapshot } from '../_shared/offerIntelligence.ts'
import { buildCandidateAssessmentPrompt, buildCandidateAssessmentRecoveryPrompt, candidateAssessmentJsonSchemaForRubric, candidateAssessmentToAnalysisOutput, candidateAssessmentValidationDiagnostic, isCandidateAssessmentOutput } from '../_shared/candidateAssessment.ts'
import { scoreScoringCriteria, SCORING_ALGORITHM_VERSION, type ScoringCriteria } from '../_shared/scoringCalibration.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const model = 'gpt-5.4-mini'
const promptVersion = 'jobmatch-job-match-v7-bilingual'
const algorithmVersion = SCORING_ALGORITHM_VERSION
const analysisContractVersion = 'jobmatch-analysis-contract-vnext-c'
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: string, status: number, diagnostics: Record<string, unknown> = {}) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status, ...diagnostics })); return response({ code, error: code }, status) }
const categories = ['experience', 'skills', 'preferences', 'growth'] as const
function validPriorities(value: unknown): value is string[] {
  const allowed = ['experience', 'skills', 'preferences', 'growth']
  return Array.isArray(value) && value.length === 4 && new Set(value).size === 4 && value.every((item) => typeof item === 'string' && allowed.includes(item))
}

async function loadPublicOfferSource(supabaseUrl: string, authorization: string, offer: Record<string, unknown>) {
  const sourceUrl = typeof offer.sourceUrl === 'string' ? normalizeRocketJobsSourceUrl(offer.sourceUrl, typeof offer.location === 'string' ? offer.location : undefined) : ''
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

function hasRunnableSourceContent(source: OfferSourceSnapshot) {
  return hasRunnableOfferSourceContent(source)
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
  const refreshStoredSource = shouldRefreshOfferSourceSnapshot({ hasStoredSource: Boolean(contract.source), storedContractVersion: contract.contractVersion, activeContractVersion: analysisContractVersion })
  let source: OfferSourceSnapshot = refreshStoredSource ? await loadPublicOfferSource(url, authorization, offer) : contract.source ?? await loadPublicOfferSource(url, authorization, offer)
  let nextSourceHash = await sourceHash(source)
  let rubric: OfferIntelligenceRubric | null = contract.contractVersion === analysisContractVersion && contract.rubric?.sourceSnapshotHash === nextSourceHash ? contract.rubric : null
  if (!rubric && source.sourceQuality !== 'full' && contract.source) {
    const refreshedSource = await loadPublicOfferSource(url, authorization, offer)
    const refreshedHash = await sourceHash(refreshedSource)
    if (refreshedSource.sourceQuality === 'full') { source = refreshedSource; nextSourceHash = refreshedHash }
  }
  if (!rubric) {
    if (!hasRunnableSourceContent(source)) return await failQueue('WORKSPACE_ANALYSIS_SOURCE_INCOMPLETE')
    let intelligenceResponse: Response | null = null
    const intelligenceSchemas = offerIntelligenceRequestSchemas(source)
    for (let schemaIndex = 0; schemaIndex < intelligenceSchemas.length; schemaIndex += 1) {
      try {
        intelligenceResponse = await requestOpenAi(apiKey, buildOfferIntelligencePrompt(source, nextSourceHash), intelligenceSchemas[schemaIndex], `${queueItemId}:offer-intelligence${schemaIndex ? `:fallback-${schemaIndex}` : ''}`)
      } catch { return await failQueue('OPENAI_OFFER_INTELLIGENCE_NETWORK_ERROR') }
      if (intelligenceResponse.ok || intelligenceResponse.status !== 400 || schemaIndex === intelligenceSchemas.length - 1) break
      console.info(JSON.stringify({ diagnostic: 'OPENAI_OFFER_INTELLIGENCE_SCHEMA_RETRY', providerStatus: intelligenceResponse.status, schemaIndex }))
    }
    if (!intelligenceResponse) return await failQueue('OPENAI_OFFER_INTELLIGENCE_NETWORK_ERROR')
    if (!intelligenceResponse.ok) {
      const errorBody = await intelligenceResponse.clone().json().catch(() => null) as { error?: { code?: unknown; param?: unknown } } | null
      console.info(JSON.stringify({ diagnostic: 'OPENAI_OFFER_INTELLIGENCE_HTTP_ERROR', providerStatus: intelligenceResponse.status, providerErrorCode: typeof errorBody?.error?.code === 'string' ? errorBody.error.code : null, providerErrorParam: typeof errorBody?.error?.param === 'string' ? errorBody.error.param : null }))
      return await failQueue('OPENAI_OFFER_INTELLIGENCE_HTTP_ERROR')
    }
    let intelligencePayload: unknown
    try { intelligencePayload = await intelligenceResponse.json() } catch { return await failQueue('OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH') }
    const parsedIntelligence = readOpenAiStructuredOutput(intelligencePayload)
    if (!parsedIntelligence.ok) return await failQueue(`OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH:${parsedIntelligence.code}`)
    if (!isOfferIntelligenceProviderOutput(parsedIntelligence.value, source)) {
      const reason = offerIntelligenceProviderValidationDiagnostic(parsedIntelligence.value, source)
      console.info(JSON.stringify({ diagnostic: 'OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH', reason }))
      return await failQueue(`OPENAI_OFFER_INTELLIGENCE_SCHEMA_MISMATCH:${reason}`)
    }
    rubric = buildOfferIntelligenceRubric(source, nextSourceHash, parsedIntelligence.value)
    if (!rubric) return await failQueue('OPENAI_OFFER_INTELLIGENCE_CONTRACT_INVALID')
  }
  const manifest = manifestFromOfferIntelligenceRubric(rubric)
  const persistedContract = contract.contractVersion === analysisContractVersion && contract.contractHash && contract.source && contract.sourceHash === nextSourceHash && contract.rubric?.sourceSnapshotHash === nextSourceHash
    ? { ok: true, contractHash: contract.contractHash }
    : await persistOfferAnalysisContract(worker, String(queueItem.user_id ?? ''), String(queueItem.offer_version_id ?? ''), source, rubric)
  if (!persistedContract.ok) return await failQueue('WORKSPACE_ANALYSIS_CONTRACT_SAVE_FAILED')
  if (!await alignQueueAnalysisIdentity(worker, queueItem, workerToken, persistedContract.contractHash)) return await failQueue('WORKSPACE_ANALYSIS_IDENTITY_SAVE_FAILED')
  if (!isOfferIntelligenceRubricRunnable(rubric) || !isManifestSufficientForAnalysis(manifest)) {
    console.info(JSON.stringify({
      diagnostic: 'WORKSPACE_ANALYSIS_RUBRIC_INSUFFICIENT',
      sourceQuality: rubric.quality.sourceCompleteness,
      rubricCompleteness: rubric.quality.rubricCompleteness,
      criterionCount: rubric.quality.criterionCount,
      sourceCriterionCount: manifest.quality.sourceCriterionCount,
      omittedCriterionCount: manifest.quality.omittedCriterionCount,
    }))
    return await failQueue('WORKSPACE_ANALYSIS_RUBRIC_INSUFFICIENT')
  }
  const candidateContext = buildAnalysisCandidateContext(profile, `${JSON.stringify(offer)}\n${source.text}`)
  const prompt = buildCandidateAssessmentPrompt(rubric, candidateContext, hardFilter)
  const recoveryPrompt = buildCandidateAssessmentRecoveryPrompt(rubric, candidateContext, hardFilter)
  const candidateSchema = candidateAssessmentJsonSchemaForRubric(rubric)
  const existingProviderResponseId = typeof queueItem.provider_response_id === 'string' ? queueItem.provider_response_id : null
  let openAiResponse: Response | null = null
  let providerResponseId: string | null = null
  let parsed: ReturnType<typeof candidateAssessmentToAnalysisOutput> | null = null
  let parsedAssessmentDiagnostics: { outputTypes: string[]; contentTypes: string[] } | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retrievingExistingResponse = attempt === 0 && Boolean(existingProviderResponseId)
    try {
      openAiResponse = retrievingExistingResponse
        ? await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(existingProviderResponseId as string)}`, { headers: { Authorization: `Bearer ${apiKey}` } })
        : await requestOpenAi(apiKey, attempt === 0 ? prompt : recoveryPrompt, candidateSchema, attempt === 0 ? queueItemId : `${queueItemId}:manifest-recovery`)
    } catch { return await failQueue(retrievingExistingResponse ? 'OPENAI_RESPONSE_RETRIEVE_ERROR' : 'OPENAI_NETWORK_ERROR') }
    if (!openAiResponse.ok) {
      const errorBody = await openAiResponse.clone().json().catch(() => null) as { error?: { code?: unknown; param?: unknown } } | null
      console.info(JSON.stringify({ diagnostic: 'OPENAI_HTTP_ERROR', providerStatus: openAiResponse.status, providerErrorCode: typeof errorBody?.error?.code === 'string' ? errorBody.error.code : null, providerErrorParam: typeof errorBody?.error?.param === 'string' ? errorBody.error.param : null }))
      return await failQueue(retrievingExistingResponse ? 'OPENAI_RESPONSE_RETRIEVE_ERROR' : 'OPENAI_HTTP_ERROR')
    }
    let payload: unknown
    try { payload = await openAiResponse.json() } catch { return await failQueue('OPENAI_SCHEMA_MISMATCH') }
    const responseId = typeof (payload as Record<string, unknown> | null)?.id === 'string' ? (payload as Record<string, unknown>).id as string : retrievingExistingResponse ? existingProviderResponseId : null
    if (!responseId) return await failQueue('OPENAI_EMPTY_OUTPUT')
    if (!retrievingExistingResponse) {
      const { error: receiptError } = await worker.rpc('workspace_record_provider_response', { p_queue_item_id: queueItemId, p_worker_token: workerToken, p_provider_response_id: responseId })
      if (receiptError) return await failQueue('ANALYSIS_PROVIDER_RECEIPT_SAVE_FAILED')
    }
    const parsedAssessment = readOpenAiStructuredOutput(payload)
    if (!parsedAssessment.ok) { console.info(JSON.stringify({ diagnostic: parsedAssessment.code, ...parsedAssessment.diagnostics })); return await failQueue(parsedAssessment.code) }
    if (!isCandidateAssessmentOutput(parsedAssessment.value, rubric)) {
      const reason = candidateAssessmentValidationDiagnostic(parsedAssessment.value, rubric)
      console.info(JSON.stringify({ diagnostic: 'OPENAI_CANDIDATE_ASSESSMENT_CONTRACT_INVALID', reason }))
      return await failQueue(`OPENAI_CANDIDATE_ASSESSMENT_CONTRACT_INVALID:${reason}`)
    }
    const candidateAnalysis = candidateAssessmentToAnalysisOutput(parsedAssessment.value, rubric)
    if (!isAnalysisOutput(candidateAnalysis)) return await failQueue('OPENAI_SCHEMA_MISMATCH')
    if (!outputMatchesManifest(candidateAnalysis.criteria, manifest)) {
      console.info(JSON.stringify({ diagnostic: 'OPENAI_CRITERIA_MANIFEST_MISMATCH', attempt, responseId }))
      if (attempt === 0) continue
      return await failQueue('OPENAI_CRITERIA_MANIFEST_MISMATCH')
    }
    providerResponseId = responseId
    parsed = candidateAnalysis
    parsedAssessmentDiagnostics = parsedAssessment.diagnostics
    break
  }
  if (!openAiResponse || !providerResponseId || !parsed || !parsedAssessmentDiagnostics) return await failQueue('OPENAI_CRITERIA_MANIFEST_MISMATCH')
  const scoring = scoreScoringCriteria(profile.priorities, parsed.criteria as ScoringCriteria)
  const rubricIsLimited = rubric.quality.sourceCompleteness !== 'full' || rubric.quality.rubricCompleteness !== 'complete' || rubric.quality.unresolvedAmbiguityCount > 0
  const finalReliability = rubricIsLimited ? 'limited' : scoring.scoring.reliability
  const analysisHardFilterStatus = hardFilter.status === 'needs_review' ? 'weak' : hardFilter.status === 'fail' ? 'fail' : 'pass'
  const finalAnalysis = {
    ...parsed,
    criteria: parsed.criteria,
    offerId: queueItem.job_offer_id,
    overallScore: scoring.overallScore,
    categoryScores: Object.fromEntries(categories.map((category) => [category, { score: scoring.categoryScores[category], rationale: parsed.criteria[category].map((criterion) => criterion.rationale).join(' ') || 'Brak ocenionych kryteriów w tej kategorii.' }])),
    recommendation: analysisHardFilterStatus === 'fail' ? 'Nie rekomenduję' : finalReliability === 'limited' && scoring.overallScore > 0 ? 'Wymaga sprawdzenia' : scoring.overallScore >= 75 && scoring.scoring.coverage >= 75 && finalReliability === 'standard' ? 'Warto aplikować' : scoring.overallScore >= 50 ? 'Wymaga sprawdzenia' : 'Nie rekomenduję',
    hardFilterStatus: analysisHardFilterStatus,
    hardFilterReasons: Array.isArray(hardFilter.reasons) ? hardFilter.reasons.map((reason) => typeof reason === 'object' && reason ? (reason as Record<string, unknown>).label : '').filter((label): label is string => typeof label === 'string') : [],
    sourceQuality: source.sourceQuality,
    modelInfo: { provider: 'openai', model, provisional: true },
    createdAt: new Date().toISOString(),
    status: 'ready',
    missingInformation: [...new Set([...parsed.missingInformation, ...source.missingInformation])],
    scoring: { ...scoring.scoring, reliability: finalReliability, algorithmVersion },
  }
  const { data: completed, error: completeError } = await worker.rpc('workspace_complete_analysis', { queue_item_id: queueItemId, worker_token: workerToken, analysis_data: finalAnalysis, model_version: model, prompt_version: promptVersion, algorithm_version: algorithmVersion, source_quality: source.sourceQuality, provider_request_id: providerResponseId })
  if (completeError || !completed) return failure('ANALYSIS_SAVE_FAILED', 502)
  console.info(JSON.stringify({ diagnostic: 'OPENAI_SUCCESS', queueItemId, requestId: openAiResponse.headers.get('x-request-id'), responseId: providerResponseId, outputTypes: parsedAssessmentDiagnostics.outputTypes, contentTypes: parsedAssessmentDiagnostics.contentTypes, validation: 'passed' }))
  return response({ status: 'completed', queueItemId })
})

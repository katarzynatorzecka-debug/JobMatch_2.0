import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const model = 'gpt-5.4-mini'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max })
const narrative = { type: 'object', additionalProperties: false, required: ['summary', 'strengths', 'risks', 'missingInformation'], properties: { summary: text(1000), strengths: { type: 'array', maxItems: 8, items: text(400) }, risks: { type: 'array', maxItems: 8, items: text(400) }, missingInformation: { type: 'array', maxItems: 12, items: text(240) } } }
const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function localizationSchema(ids: string[]) {
  return {
    type: 'object', additionalProperties: false, required: ['localizedContent', 'criteria'], properties: {
      localizedContent: { type: 'object', additionalProperties: false, required: ['pl', 'en'], properties: { pl: narrative, en: narrative } },
      criteria: { type: 'array', minItems: ids.length, maxItems: ids.length, items: { type: 'object', additionalProperties: false, required: ['id', 'rationale'], properties: { id: { type: 'string', enum: ids.length ? ids : ['no-criteria'] }, rationale: { type: 'object', additionalProperties: false, required: ['pl', 'en'], properties: { pl: text(500), en: text(500) } } } } },
    },
  }
}

function validNarrative(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return typeof data.summary === 'string' && data.summary.trim().length > 0 && ['strengths', 'risks', 'missingInformation'].every((key) => Array.isArray(data[key]) && (data[key] as unknown[]).every((item) => typeof item === 'string' && item.trim().length > 0))
}

function alreadyLocalized(analysis: Record<string, unknown>) {
  const content = analysis.localizedContent as Record<string, unknown> | undefined
  return Boolean(content && validNarrative(content.pl) && validNarrative(content.en))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ code: 'METHOD_NOT_ALLOWED' }, 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return response({ code: 'AUTH_REQUIRED' }, 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!serviceKey || !apiKey) return response({ code: 'LOCALIZATION_NOT_CONFIGURED' }, 503)
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await userClient.auth.getUser()
  if (!auth.user) return response({ code: 'AUTH_INVALID' }, 401)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return response({ code: 'REQUEST_INVALID' }, 400) }
  const analysisVersionId = typeof body.analysisVersionId === 'string' ? body.analysisVersionId : ''
  if (!uuid.test(analysisVersionId)) return response({ code: 'ANALYSIS_VERSION_REQUIRED' }, 400)
  const worker = createClient(url, serviceKey, { global: { headers: { Authorization: `Bearer ${serviceKey}` } } })
  const { data: row, error: readError } = await worker.from('analysis_versions').select('id,user_id,analysis_data').eq('id', analysisVersionId).eq('user_id', auth.user.id).maybeSingle()
  if (readError || !row) return response({ code: 'ANALYSIS_VERSION_NOT_FOUND' }, 404)
  const analysis = row.analysis_data as Record<string, unknown>
  if (!analysis || typeof analysis !== 'object') return response({ code: 'ANALYSIS_DATA_INVALID' }, 409)
  if (alreadyLocalized(analysis)) return response({ analysis, reused: true })
  const criteria = analysis.criteria && typeof analysis.criteria === 'object'
    ? Object.values(analysis.criteria as Record<string, unknown>).flatMap((items) => Array.isArray(items) ? items : []).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'))
    : []
  const ids = criteria.map((criterion) => String(criterion.id))
  if (new Set(ids).size !== ids.length) return response({ code: 'ANALYSIS_CRITERIA_INVALID' }, 409)
  const source = { summary: analysis.summary, strengths: analysis.strengths, risks: analysis.risks, missingInformation: analysis.missingInformation, criteria: criteria.map((criterion) => ({ id: criterion.id, requirement: criterion.requirement, rationale: criterion.rationale })) }
  const prompt = `Przygotuj dwie równoważne wersje językowe PL i EN istniejącego opisu analizy JobMatch. To jest wyłącznie lokalizacja prezentacji: nie oceniaj kandydata ponownie, nie zmieniaj wyniku, wniosków ani liczby kryteriów. Zachowaj dokładnie każde id i ich kolejność. Nie tłumacz nazw firm, projektów, technologii ani nazw własnych. Nie dodawaj faktów. localizedContent.pl i localizedContent.en oraz rationale.pl i rationale.en muszą przekazywać to samo znaczenie.\nsource: ${JSON.stringify(source)}`
  let provider: Response
  try { provider = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': `localize:${analysisVersionId}` }, body: JSON.stringify({ model, reasoning: { effort: 'low' }, input: prompt, text: { format: { type: 'json_schema', name: 'job_match_localization', strict: true, schema: localizationSchema(ids) } } }) }) } catch { return response({ code: 'OPENAI_NETWORK_ERROR' }, 502) }
  if (!provider.ok) return response({ code: 'OPENAI_HTTP_ERROR' }, 502)
  const payload = await provider.json().catch(() => null)
  const parsed = readOpenAiStructuredOutput(payload)
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') return response({ code: 'OPENAI_SCHEMA_MISMATCH' }, 502)
  const localized = parsed.value as Record<string, unknown>
  const content = localized.localizedContent as Record<string, unknown> | undefined
  const localizedCriteria = Array.isArray(localized.criteria) ? localized.criteria as Array<Record<string, unknown>> : []
  if (!content || !validNarrative(content.pl) || !validNarrative(content.en) || localizedCriteria.length !== ids.length || localizedCriteria.some((item, index) => item.id !== ids[index] || !item.rationale || typeof item.rationale !== 'object')) return response({ code: 'OPENAI_LOCALIZATION_CONTRACT_INVALID' }, 502)
  const rationales = new Map(localizedCriteria.map((item) => [String(item.id), item.rationale]))
  const nextCriteria = analysis.criteria && typeof analysis.criteria === 'object' ? Object.fromEntries(Object.entries(analysis.criteria as Record<string, unknown>).map(([category, items]) => [category, Array.isArray(items) ? items.map((item) => item && typeof item === 'object' && rationales.has(String((item as Record<string, unknown>).id)) ? { ...(item as Record<string, unknown>), localizedRationale: rationales.get(String((item as Record<string, unknown>).id)) } : item) : items])) : analysis.criteria
  const nextAnalysis = { ...analysis, localizedContent: content, criteria: nextCriteria }
  const { error: updateError } = await worker.from('analysis_versions').update({ analysis_data: nextAnalysis }).eq('id', analysisVersionId).eq('user_id', auth.user.id)
  if (updateError) return response({ code: 'LOCALIZATION_SAVE_FAILED' }, 502)
  console.info(JSON.stringify({ diagnostic: 'ANALYSIS_LOCALIZATION_SUCCESS', analysisVersionId, criterionCount: ids.length }))
  return response({ analysis: nextAnalysis, reused: false })
})

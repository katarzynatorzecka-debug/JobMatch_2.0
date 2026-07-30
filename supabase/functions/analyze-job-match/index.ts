import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isAnalysisOutput, jobAnalysisOutputJsonSchema } from '../_shared/jobAnalysisOutputSchema.ts'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: string, status: number, diagnostics: Record<string, unknown> = {}) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status, ...diagnostics })); return response({ code, error: code }, status) }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return failure('METHOD_NOT_ALLOWED', 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return failure('AUTH_REQUIRED', 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return failure('AUTH_INVALID', 401)
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return failure('OPENAI_NOT_CONFIGURED', 503)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return failure('REQUEST_INVALID', 400) }
  const offer = body.offer as Record<string, unknown> | undefined
  const hardFilter = body.hardFilter as Record<string, unknown> | undefined
  const profile = body.profile as Record<string, unknown> | undefined
  if (!offer || !profile || !hardFilter || typeof offer.id !== 'string' || !['pass', 'weak'].includes(String(hardFilter.status))) return failure('REQUEST_INVALID', 400)
  const sourceQuality = ['full', 'partial', 'unavailable', 'fixture'].includes(String(body.sourceQuality)) ? String(body.sourceQuality) : 'partial'
  const content = typeof body.offerContent === 'string' ? body.offerContent.slice(0, 18000) : ''
  const prompt = `Oceń dopasowanie kandydata do oferty pracy, nie atrakcyjność firmy. Nie wymyślaj faktów. Uwzględnij braki w missingInformation. Hard Filter jest niezależny: status ${hardFilter.status} i jego powody pozostają wiążące. Przy weak ryzyka muszą wskazywać niepewność.\nProfil: ${JSON.stringify(profile)}\nOferta znormalizowana: ${JSON.stringify(offer)}\nHard Filter: ${JSON.stringify(hardFilter)}\nPełna treść oferty (może być pusta): ${content}`
  const openAiResponse = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.4-mini', reasoning: { effort: 'low' }, input: prompt, text: { format: { type: 'json_schema', name: 'job_match', strict: true, schema: jobAnalysisOutputJsonSchema } } }) })
  if (!openAiResponse.ok) return failure('OPENAI_HTTP_ERROR', 502, { providerStatus: openAiResponse.status })
  let payload: unknown
  try { payload = await openAiResponse.json() } catch { return failure('OPENAI_SCHEMA_MISMATCH', 502, { responseJson: false }) }
  const parsed = readOpenAiStructuredOutput(payload)
  if (!parsed.ok) return failure(parsed.code, 502, parsed.diagnostics)
  if (!isAnalysisOutput(parsed.value)) return failure('OPENAI_SCHEMA_MISMATCH', 502, { ...parsed.diagnostics, validation: 'output_schema_failed' })
  const finalAnalysis = { ...parsed.value, offerId: offer.id, hardFilterStatus: hardFilter.status, hardFilterReasons: Array.isArray(hardFilter.reasons) ? hardFilter.reasons.map((reason) => typeof reason === 'object' && reason ? (reason as Record<string, unknown>).label : '').filter((label): label is string => typeof label === 'string') : [], sourceQuality, modelInfo: { provider: 'openai', model: 'gpt-5.4-mini', provisional: sourceQuality !== 'full' }, createdAt: new Date().toISOString(), status: 'ready' }
  console.info(JSON.stringify({ diagnostic: 'OPENAI_SUCCESS', responseId: parsed.diagnostics.responseId, outputTypes: parsed.diagnostics.outputTypes, contentTypes: parsed.diagnostics.contentTypes, outputKeys: Object.keys(parsed.value as Record<string, unknown>).sort(), validation: 'passed' }))
  return response(finalAnalysis)
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cvProfileOutputJsonSchema, isCvProfileOutput } from '../_shared/cvProfileOutputSchema.ts'
import { readOpenAiStructuredOutput } from '../_shared/openAiStructuredOutput.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const model = 'gpt-5.4-mini'
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: string, status: number) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status })); return response({ code, error: code }, status) }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return failure('METHOD_NOT_ALLOWED', 405)
  const authorization = request.headers.get('Authorization')
  if (!authorization) return failure('AUTH_REQUIRED', 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return failure('OPENAI_NOT_CONFIGURED', 503)
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await userClient.auth.getUser()
  if (!auth.user) return failure('AUTH_INVALID', 401)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return failure('REQUEST_INVALID', 400) }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length < 100 || text.length > 30_000) return failure('CV_TEXT_INVALID', 400)

  const prompt = `Zmapuj wyłącznie dane bezpośrednio wspierane przez poniższy tekst CV. Nie dodawaj preferencji przyszłej pracy, must-have, blacklisty, wykluczeń ani priorytetów. Dla każdego pola i faktu zwróć value, status, confidence 0-1 i 1-3 krótkie dowody (maks. 180 znaków każdy). Dowód ma być minimalnym fragmentem lub krótką parafrazą, nigdy pełnym akapitem CV. extracted oznacza bezpośredni zapis w CV. inferred jest dozwolone wyłącznie przy oczywistej interpretacji z dowodem. unknown wymaga pustej wartości i pustych dowodów. candidateFacts.experienceEntries jest kanoniczną historią zawodową: zwracaj osobny wpis tylko dla faktycznego zatrudnienia lub jasno opisanego doświadczenia zawodowego; nie wymyślaj firmy, dat, czasu trwania, odpowiedzialności, domen ani osiągnięć. candidateFacts.projects jest równorzędnym źródłem dowodów: wyodrębnij nazwane projekty, w szczególności ich zakres, rolę kandydata, stack, rezultat, link tylko gdy występuje w CV, informację o wdrożeniu tylko gdy CV ją potwierdza oraz konkretne dowody UX/UI i prototypowania. Nie twórz projektu z samej nazwy technologii i nie dopisuj JobMatchMaker ani BEN10, jeśli tekst CV ich nie zawiera. candidateFacts zawiera wyłącznie fakty: doświadczenie, projekty, domeny, odpowiedzialności, osiągnięcia, języki, edukację, certyfikaty oraz skills. Skill evidenceLevel: professional tylko przy użyciu w pracy, project tylko przy projekcie, learning przy nauce, mentioned przy samym wymienieniu. Career target nie jest doświadczeniem. Lokalizacje, tryby pracy i formy umowy zwróć tylko, jeśli CV wprost przedstawia je jako dostępność lub preferencję kandydata, nie na podstawie historii zatrudnienia. Dla workModes użyj remote/hybrid/onsite; dla contractTypes employment/b2b/mandate/freelance/internship. Tekst CV:\n${text}`
  let openAiResponse: Response
  try {
    openAiResponse = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, reasoning: { effort: 'low' }, input: prompt, text: { format: { type: 'json_schema', name: 'cv_profile_mapping', strict: true, schema: cvProfileOutputJsonSchema } } }) })
  } catch { return failure('OPENAI_NETWORK_ERROR', 502) }
  if (!openAiResponse.ok) { console.info(JSON.stringify({ diagnostic: 'OPENAI_HTTP_ERROR', providerStatus: openAiResponse.status })); return failure('OPENAI_HTTP_ERROR', 502) }
  let payload: unknown
  try { payload = await openAiResponse.json() } catch { return failure('OPENAI_SCHEMA_MISMATCH', 502) }
  const parsed = readOpenAiStructuredOutput(payload)
  if (!parsed.ok) { console.info(JSON.stringify({ diagnostic: parsed.code, responseId: parsed.diagnostics.responseId })); return failure(parsed.code, 502) }
  if (!isCvProfileOutput(parsed.value)) return failure('OPENAI_SCHEMA_MISMATCH', 502)
  console.info(JSON.stringify({ diagnostic: 'CV_MAPPING_SUCCESS', responseId: parsed.diagnostics.responseId, outputTypes: parsed.diagnostics.outputTypes }))
  return response({ mapping: parsed.value })
})

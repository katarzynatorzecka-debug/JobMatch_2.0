import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const maxBytes = 1_250_000
const allowedHosts = new Set(['rocketjobs.pl', 'www.rocketjobs.pl'])
type ErrorCode = 'UNSUPPORTED_SOURCE_DOMAIN' | 'SOURCE_URL_MISSING' | 'SOURCE_FETCH_FAILED' | 'SOURCE_TIMEOUT' | 'SOURCE_TOO_LARGE' | 'SOURCE_EMPTY' | 'SOURCE_PARSE_FAILED' | 'SOURCE_BLOCKED'
function response(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }
function failure(code: ErrorCode, status: number) { console.info(JSON.stringify({ diagnostic: code, httpStatus: status })); return response({ code, error: code }, status) }
function allowed(url: URL) { return url.protocol === 'https:' && allowedHosts.has(url.hostname.toLowerCase()) }
function compact(value: string) { return value.replace(/\s+/g, ' ').trim() }
function decode(value: string) { return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>') }
function section(lines: string[], labels: string[]) { const start = lines.findIndex((line) => labels.some((label) => line.toLowerCase().includes(label))); if (start < 0) return []; const values: string[] = []; for (let index = start + 1; index < Math.min(lines.length, start + 18); index += 1) if (lines[index].length >= 3) values.push(lines[index]); return [...new Set(values)].slice(0, 20) }
function normalize(offerId: string, sourceUrl: string, html: string, imported: Record<string, unknown>) {
  const title = compact((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, ''))
  const main = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? html
  const withoutNoise = main.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<(?:div|section)[^>]*(?:cookie|consent|tracking|newsletter|breadcrumb)[^>]*>[\s\S]*?<\/(?:div|section)>/gi, ' ').replace(/<\/(?:p|li|h[1-6]|section|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  const lines = decode(withoutNoise).split(/\n+/).map(compact).filter((line) => line.length >= 3)
  const description = compact(lines.join(' ')).slice(0, 18_000)
  if (!description) return null
  const requirements = section(lines, ['wymagania', 'requirements', 'czego oczekujemy']); const responsibilities = section(lines, ['obowiązki', 'responsibilities', 'twoje zadania', 'zakres obowiązków']); const benefits = section(lines, ['benefity', 'benefits', 'co oferujemy'])
  const sourceQuality = description.length > 260 && (requirements.length > 0 || responsibilities.length > 0) ? 'full' : 'partial'
  const missingInformation = [requirements.length ? null : 'wymagania', responsibilities.length ? null : 'zakres obowiązków', benefits.length ? null : 'benefity'].filter((value): value is string => Boolean(value))
  const field = (name: string) => typeof imported[name] === 'string' && imported[name].trim() ? imported[name].trim() : undefined
  return { offerId, sourceUrl, status: sourceQuality === 'full' ? 'completed' : 'partial', sourceQuality, title: title || field('title'), company: field('company'), location: field('location'), workMode: field('workMode'), contractType: field('contractType'), salary: field('salary'), description, requirements, responsibilities, benefits, missingInformation, warnings: sourceQuality === 'partial' ? ['Znaleziono tylko część znormalizowanej treści oferty.'] : [], fetchedAt: new Date().toISOString() }
}
async function readLimited(body: ReadableStream<Uint8Array> | null) { if (!body) return ''; const reader = body.getReader(); const chunks: Uint8Array[] = []; let size = 0; while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error('SOURCE_TOO_LARGE'); chunks.push(value) }; const output = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }; return new TextDecoder().decode(output) }
async function fetchAllowed(url: URL) { let current = url; for (let redirect = 0; redirect < 4; redirect += 1) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000); let result: Response; try { result = await fetch(current, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'JobMatch/1.0 offer source fetcher' } }) } catch (error) { clearTimeout(timer); if ((error as { name?: string }).name === 'AbortError') throw new Error('SOURCE_TIMEOUT'); throw new Error('SOURCE_FETCH_FAILED') }; clearTimeout(timer); if (result.status >= 300 && result.status < 400) { const location = result.headers.get('location'); if (!location) throw new Error('SOURCE_FETCH_FAILED'); current = new URL(location, current); if (!allowed(current)) throw new Error('UNSUPPORTED_SOURCE_DOMAIN'); continue }; if (result.status === 401 || result.status === 403 || result.status === 429) throw new Error('SOURCE_BLOCKED'); if (!result.ok) throw new Error('SOURCE_FETCH_FAILED'); const size = Number(result.headers.get('content-length') ?? 0); if (size > maxBytes) throw new Error('SOURCE_TOO_LARGE'); return { finalUrl: current, html: await readLimited(result.body) } }; throw new Error('SOURCE_FETCH_FAILED') }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ code: 'SOURCE_FETCH_FAILED' }, 405)
  const authorization = request.headers.get('Authorization'); if (!authorization) return response({ code: 'SOURCE_FETCH_FAILED' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return response({ code: 'SOURCE_FETCH_FAILED' }, 401)
  let body: { offerId?: unknown; sourceUrl?: unknown; offer?: unknown }; try { body = await request.json() } catch { return failure('SOURCE_PARSE_FAILED', 400) }
  if (typeof body.offerId !== 'string' || !body.offerId || typeof body.sourceUrl !== 'string' || !body.sourceUrl) return failure('SOURCE_URL_MISSING', 400)
  let url: URL; try { url = new URL(body.sourceUrl) } catch { return failure('SOURCE_URL_MISSING', 400) }
  if (!allowed(url)) return failure('UNSUPPORTED_SOURCE_DOMAIN', 422)
  try { const fetched = await fetchAllowed(url); const result = normalize(body.offerId, fetched.finalUrl.toString(), fetched.html, body.offer && typeof body.offer === 'object' ? body.offer as Record<string, unknown> : {}); if (!result) return failure('SOURCE_EMPTY', 422); console.info(JSON.stringify({ diagnostic: 'SOURCE_SUCCESS', sourceQuality: result.sourceQuality, status: result.status })); return response(result) } catch (error) { const code = error instanceof Error ? error.message as ErrorCode : 'SOURCE_FETCH_FAILED'; return failure(['UNSUPPORTED_SOURCE_DOMAIN', 'SOURCE_TIMEOUT', 'SOURCE_TOO_LARGE', 'SOURCE_BLOCKED'].includes(code) ? code : 'SOURCE_FETCH_FAILED', 502) }
})

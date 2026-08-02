import type { OfferSourceResult } from '../../contracts/offerSource'

function compact(value: string) { return value.replace(/\s+/g, ' ').trim() }
function decodeEntities(value: string) { return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>') }
function section(lines: string[], labels: string[]) {
  const start = lines.findIndex((line) => labels.some((label) => line.toLocaleLowerCase().includes(label)))
  if (start < 0) return []
  const values: string[] = []
  for (let index = start + 1; index < Math.min(lines.length, start + 18); index += 1) {
    const line = lines[index]
    if (labels.some((label) => line.toLocaleLowerCase().includes(label))) continue
    if (line.length >= 3) values.push(line)
  }
  return [...new Set(values)].slice(0, 20)
}

export function normalizeOfferPage(offerId: string, sourceUrl: string, html: string): OfferSourceResult {
  const title = compact((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, ''))
  const main = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? html
  const withoutNoise = main
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:div|section)[^>]*(?:cookie|consent|tracking|newsletter|breadcrumb)[^>]*>[\s\S]*?<\/(?:div|section)>/gi, ' ')
    .replace(/<\/(?:p|li|h[1-6]|section|div|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const lines = decodeEntities(withoutNoise).split(/\n+/).map(compact).filter((line) => line.length >= 3)
  const description = compact(lines.join(' ')).slice(0, 18_000)
  if (!description) return { offerId, sourceUrl, status: 'unavailable', sourceQuality: 'unavailable', requirements: [], responsibilities: [], benefits: [], missingInformation: ['opis oferty'], warnings: [], fetchedAt: new Date().toISOString(), errorCode: 'SOURCE_EMPTY' }
  const requirements = section(lines, ['wymagania', 'requirements', 'czego oczekujemy'])
  const responsibilities = section(lines, ['obowiązki', 'responsibilities', 'twoje zadania', 'zakres obowiązków'])
  const benefits = section(lines, ['benefity', 'benefits', 'co oferujemy'])
  const sourceQuality = description.length > 260 && (requirements.length > 0 || responsibilities.length > 0) ? 'full' : 'partial'
  const missingInformation = [requirements.length ? null : 'wymagania', responsibilities.length ? null : 'zakres obowiązków', benefits.length ? null : 'benefity'].filter((value): value is string => Boolean(value))
  return { offerId, sourceUrl, status: sourceQuality === 'full' ? 'completed' : 'partial', sourceQuality, title: title || undefined, description, requirements, responsibilities, benefits, missingInformation, warnings: sourceQuality === 'partial' ? ['Znaleziono tylko część znormalizowanej treści oferty.'] : [], fetchedAt: new Date().toISOString() }
}

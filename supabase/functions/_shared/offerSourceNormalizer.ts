type SourceSection = 'requirements' | 'responsibilities' | 'benefits' | 'ignore'

type SectionHeading = { section: SourceSection; prefix?: string }

export type NormalizedOfferSource = {
  offerId: string
  sourceUrl: string
  status: 'completed' | 'partial' | 'unavailable'
  sourceQuality: 'full' | 'partial' | 'unavailable'
  title?: string
  company?: string
  location?: string
  workMode?: string
  contractType?: string
  salary?: string
  description?: string
  requirements: string[]
  responsibilities: string[]
  benefits: string[]
  missingInformation: string[]
  warnings: string[]
  fetchedAt: string
  errorCode?: 'SOURCE_EMPTY'
}

const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
const normalizeHeading = (value: string) => compact(value).toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const headingMarker = '__JM_HEADING__'
const withoutHeadingMarker = (value: string) => value.startsWith(headingMarker) ? value.slice(headingMarker.length).trim() : value

function decodeEntities(value: string) {
  const named: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', bull: '•' }
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLocaleLowerCase()] ?? match)
}

const headingMap = new Map<string, SectionHeading>([
  ['wymagania', { section: 'requirements' }],
  ['nasze wymagania', { section: 'requirements' }],
  ['czego oczekujemy', { section: 'requirements' }],
  ['wymagane umiejetnosci', { section: 'requirements' }],
  ['znajomosc jezykow', { section: 'requirements', prefix: 'Wymagany język: ' }],
  ['requirements', { section: 'requirements' }],
  ['what we expect', { section: 'requirements' }],
  ['what were looking for', { section: 'requirements' }],
  ['what you bring', { section: 'requirements' }],
  ['who you are', { section: 'requirements' }],
  ['about you', { section: 'requirements' }],
  ['you are a good fit if', { section: 'requirements' }],
  ['we look forward to working together if', { section: 'requirements' }],
  ['qualifications', { section: 'requirements' }],
  ['required skills', { section: 'requirements' }],
  ['must haves', { section: 'requirements' }],
  ['mile widziane', { section: 'requirements', prefix: 'Mile widziane: ' }],
  ['nice to have', { section: 'requirements', prefix: 'Mile widziane: ' }],
  ['nice to haves', { section: 'requirements', prefix: 'Mile widziane: ' }],
  ['even better if', { section: 'requirements', prefix: 'Mile widziane: ' }],
  ['obowiazki', { section: 'responsibilities' }],
  ['twoje zadania', { section: 'responsibilities' }],
  ['zakres obowiazkow', { section: 'responsibilities' }],
  ['what you will do', { section: 'responsibilities' }],
  ['what youll do', { section: 'responsibilities' }],
  ['what you will be doing', { section: 'responsibilities' }],
  ['your responsibilities', { section: 'responsibilities' }],
  ['responsibilities', { section: 'responsibilities' }],
  ['your role', { section: 'responsibilities' }],
  ['opis stanowiska', { section: 'responsibilities' }],
  ['job description', { section: 'responsibilities' }],
  ['about the role', { section: 'responsibilities' }],
  ['benefity', { section: 'benefits' }],
  ['co oferujemy', { section: 'benefits' }],
  ['oferujemy', { section: 'benefits' }],
  ['benefits', { section: 'benefits' }],
  ['what we offer', { section: 'benefits' }],
  ['what makes us a great place to work', { section: 'benefits' }],
  ['why join us', { section: 'benefits' }],
  ['o firmie', { section: 'ignore' }],
  ['about the company', { section: 'ignore' }],
  ['about us', { section: 'ignore' }],
  ['proces rekrutacji', { section: 'ignore' }],
  ['etapy rekrutacji', { section: 'ignore' }],
  ['lokalizacja', { section: 'ignore' }],
  ['informacje o firmie', { section: 'ignore' }],
])

function headingFor(line: string): SectionHeading | null {
  const normalized = normalizeHeading(withoutHeadingMarker(line))
  if (/^about (?!the role\b)/.test(normalized)) return { section: 'ignore' }
  return headingMap.get(normalized) ?? null
}

function looksLikeBoundary(line: string) {
  const value = compact(line)
  return value.startsWith(headingMarker) || (value.length <= 80 && /:$/.test(value))
}

function unique(values: string[], max = 80) {
  const keys = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const next = compact(value).slice(0, 1500)
    const key = normalizeHeading(next)
    if (!next || next.length < 3 || keys.has(key)) continue
    keys.add(key)
    result.push(next)
    if (result.length >= max) break
  }
  return result
}

function valuesFor(lines: string[], target: SourceSection) {
  const values: string[] = []
  let active: SectionHeading | null = null
  for (const line of lines) {
    const heading = headingFor(line)
    if (heading) { active = heading; continue }
    if (looksLikeBoundary(line)) { active = null; continue }
    if (active?.section === target) values.push(`${active.prefix ?? ''}${withoutHeadingMarker(line)}`)
  }
  return unique(values)
}

export function extractExplicitRequirementLines(text: string) {
  const expanded = decodeEntities(text)
    .replace(/[•●▪◦]\s*/g, '\n')
    .replace(/\s+(?=(?:you (?:have|are|can|bring|know|understand|enjoy)|candidates? must|we (?:expect|require)|wymagamy|oczekujemy|posiadasz|masz|znajomo[śs][ćc])\b)/gi, '\n')
  const fragments = expanded.split(/\n+|(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/u).map(compact)
  const cue = /\b(?:wymag|oczekuj|minimum|co najmniej|do[śs]wiadczen|znajomo[śs][ćc]|umiej[ęe]tno[śs][ćc]|bieg[łl]|gotowo[śs][ćc]|must|required|requirements?|at least|years? of experience|you (?:have|are|can|bring|know|understand|enjoy)|we (?:expect|require)|fluent|proficien|ability to|track record)\b/i
  return unique(fragments.filter((value) => value.length <= 500 && cue.test(value)), 32)
}

export function normalizeOfferPage(offerId: string, sourceUrl: string, html: string, imported: Record<string, unknown> = {}): NormalizedOfferSource {
  const title = compact(decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, '')))
  const main = html.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? html
  const withoutNoise = main
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:div|section)[^>]*(?:cookie|consent|tracking|newsletter|breadcrumb)[^>]*>[\s\S]*?<\/(?:div|section)>/gi, ' ')
    .replace(/<h[1-6]\b[^>]*>/gi, `\n${headingMarker}`)
    .replace(/<\/(?:p|li|h[1-6]|section|div|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const lines = decodeEntities(withoutNoise).split(/\n+/).map(compact).filter((line) => line.length >= 3)
  const description = lines.map(withoutHeadingMarker).join('\n').slice(0, 18_000).trim()
  if (!description) return { offerId, sourceUrl, status: 'unavailable', sourceQuality: 'unavailable', requirements: [], responsibilities: [], benefits: [], missingInformation: ['opis oferty'], warnings: [], fetchedAt: new Date().toISOString(), errorCode: 'SOURCE_EMPTY' }
  const sectionRequirements = valuesFor(lines, 'requirements')
  const requirements = sectionRequirements.length ? sectionRequirements : extractExplicitRequirementLines(description)
  const responsibilities = valuesFor(lines, 'responsibilities')
  const benefits = valuesFor(lines, 'benefits')
  const sourceQuality = description.length > 260 && requirements.length > 0 && responsibilities.length > 0 ? 'full' : 'partial'
  const missingInformation = [requirements.length ? null : 'wymagania', responsibilities.length ? null : 'zakres obowiązków', benefits.length ? null : 'benefity'].filter((value): value is string => Boolean(value))
  const field = (name: string) => typeof imported[name] === 'string' && imported[name].trim() ? imported[name].trim() : undefined
  return { offerId, sourceUrl, status: sourceQuality === 'full' ? 'completed' : 'partial', sourceQuality, title: title || field('title'), company: field('company'), location: field('location'), workMode: field('workMode'), contractType: field('contractType'), salary: field('salary'), description, requirements, responsibilities, benefits, missingInformation, warnings: sourceQuality === 'partial' ? ['Znaleziono tylko część znormalizowanej treści oferty.'] : [], fetchedAt: new Date().toISOString() }
}

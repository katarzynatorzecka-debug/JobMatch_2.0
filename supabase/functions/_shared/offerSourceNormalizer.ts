type SourceSection = 'description' | 'requirements' | 'responsibilities' | 'benefits' | 'ignore'

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

function structuredJobMetadata(html: string) {
  const result: { location?: string; workMode?: string; contractType?: string; salary?: string } = {}
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(decodeEntities(script[1])) as Record<string, unknown> | Array<Record<string, unknown>>
      const candidates = Array.isArray(parsed) ? parsed : [parsed]
      const job = candidates.find((item) => item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))))
      if (!job) continue
      const location = job.jobLocation
      const locationObject = Array.isArray(location) ? location[0] : location
      const address = locationObject && typeof locationObject === 'object' ? (locationObject as Record<string, unknown>).address : null
      const addressObject = address && typeof address === 'object' ? address as Record<string, unknown> : null
      const locationValue = [addressObject?.addressLocality, addressObject?.addressRegion, addressObject?.addressCountry].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ')
      if (locationValue) result.location = locationValue
      const employmentType = Array.isArray(job.employmentType)
        ? job.employmentType.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ')
        : typeof job.employmentType === 'string' ? job.employmentType.trim() : ''
      if (employmentType) {
        // JSON-LD commonly exposes FULL_TIME/PART_TIME, which is work time,
        // not a Polish legal contract. Keep it as a non-missing hint and let
        // a visible RocketJobs contract label take precedence below.
        const normalizedEmploymentType = employmentType.toLocaleLowerCase('en-US').replace(/[-\s]+/g, '_')
        result.contractType = normalizedEmploymentType === 'full_time' ? 'Pełny etat' : normalizedEmploymentType === 'part_time' ? 'Część etatu' : employmentType
      }
      if (String(job.jobLocationType ?? '').toUpperCase() === 'TELECOMMUTE') result.workMode = 'Praca zdalna'
      const salary = job.baseSalary
      if (salary && typeof salary === 'object') {
        const salaryObject = salary as Record<string, unknown>
        const value = salaryObject.value && typeof salaryObject.value === 'object' ? salaryObject.value as Record<string, unknown> : salaryObject
        const amount = typeof value.value === 'number' || typeof value.value === 'string' ? String(value.value) : ''
        const currency = typeof salaryObject.currency === 'string' ? salaryObject.currency : ''
        if (amount) result.salary = [amount, currency].filter(Boolean).join(' ')
      }
      break
    } catch { /* malformed JSON-LD is not a source failure */ }
  }
  return result
}

function labeledMetadata(lines: string[]) {
  const text = lines.map(withoutHeadingMarker).join('\n')
  const find = (pattern: RegExp) => text.match(pattern)?.[1]?.trim()
  return {
    location: find(/(?:lokalizacja|location|miejsce pracy)\s*[:\-]\s*([^\n]{2,120})/i),
    workMode: find(/(?:tryb pracy|work mode|model pracy)\s*[:\-]\s*([^\n]{2,80})/i) ?? text.match(/\b(praca\s+hybrydowa|hybrydowo|hybrid|praca\s+zdalna|zdalnie|remote|praca\s+stacjonarna|stacjonarnie|onsite)\b/i)?.[1],
    contractType: find(/(?:rodzaj umowy|forma współpracy|forma zatrudnienia|employment type)\s*[:\-]\s*([^\n]{2,100})/i) ?? text.match(/\b(umowa\s+o\s+pracę|uop|b2b|umowa\s+zlecenie|freelance|kontrakt|internship|staż)\b/i)?.[1],
    salary: find(/(?:wynagrodzenie|salary|stawka)\s*[:\-]\s*([^\n]{2,120})/i) ?? text.match(/\b\d[\d\s.,]*\s*(?:PLN|zł|EUR|USD)(?:\s*\/\s*(?:h|miesiąc|month))?\b/i)?.[0],
  }
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
  ['czego szukamy', { section: 'requirements' }],
  ['kogo szukamy', { section: 'requirements' }],
  ['nasze oczekiwania', { section: 'requirements' }],
  ['my liczymy na', { section: 'requirements' }],
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
  ['co bedziesz robic', { section: 'responsibilities' }],
  ['your responsibilities', { section: 'responsibilities' }],
  ['responsibilities', { section: 'responsibilities' }],
  ['your role', { section: 'responsibilities' }],
  ['czym bedziesz sie zajmowac', { section: 'responsibilities' }],
  ['pracujac na tym stanowisku bedziesz zajmowac sie przede wszystkim', { section: 'responsibilities' }],
  ['czego wymagamy', { section: 'requirements' }],
  ['opis stanowiska', { section: 'description' }],
  ['job description', { section: 'responsibilities' }],
  ['about the role', { section: 'responsibilities' }],
  ['benefity', { section: 'benefits' }],
  ['co oferujemy', { section: 'benefits' }],
  ['oferujemy', { section: 'benefits' }],
  ['benefits', { section: 'benefits' }],
  ['what we offer', { section: 'benefits' }],
  ['what makes us a great place to work', { section: 'benefits' }],
  ['why join us', { section: 'benefits' }],
  ['mozesz liczyc na', { section: 'benefits' }],
  ['co zyskujesz', { section: 'benefits' }],
  ['dlaczego warto', { section: 'benefits' }],
  ['nasza oferta', { section: 'benefits' }],
  ['you will', { section: 'responsibilities' }],
  ['we need you', { section: 'requirements' }],
  ['we offer', { section: 'benefits' }],
  ['o firmie', { section: 'ignore' }],
  ['about the company', { section: 'ignore' }],
  ['about us', { section: 'ignore' }],
  ['proces rekrutacji', { section: 'ignore' }],
  ['etapy rekrutacji', { section: 'ignore' }],
  ['lokalizacja', { section: 'ignore' }],
  ['lokalizacja biura', { section: 'ignore' }],
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
    if (looksLikeBoundary(line)) {
      // RocketJobs uses nested h4 tags for skill chips. Preserve those values
      // inside the active section instead of treating every unknown heading as
      // a section boundary.
      if (line.startsWith(headingMarker) && active?.section === target) { values.push(withoutHeadingMarker(line)); continue }
      active = null
      continue
    }
    if (active?.section === target) values.push(`${active.prefix ?? ''}${withoutHeadingMarker(line)}`)
  }
  return unique(values)
}

function unsectionedLines(lines: string[]) {
  const values: string[] = []
  let active: SectionHeading | null = null
  for (const line of lines) {
    const heading = headingFor(line)
    if (heading) { active = heading; continue }
    if (looksLikeBoundary(line)) { active = null; continue }
    if (!active) values.push(withoutHeadingMarker(line))
  }
  return values
}

export function extractExplicitRequirementLines(text: string) {
  const expanded = decodeEntities(text)
    .replace(/[•●▪◦]\s*/g, '\n')
    .replace(/\s+(?=(?:you (?:have|are|can|bring|know|understand|enjoy)|candidates? must|we (?:expect|require)|wymagamy|oczekujemy|posiadasz|masz|znajomo[śs][ćc])\b)/gi, '\n')
  const fragments = expanded.split(/\n+|(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/u).map(compact)
  const cue = /\b(?:wymag\w*|oczekuj\w*|minimum|co najmniej|do[śs]wiadczen\w*|znajomo[śs][ćc]\w*|umiej[ęe]tno[śs][ćc]\w*|bieg\w*|gotowo[śs][ćc]\w*|must|required|requirements?|language|at least|years? of experience|you (?:have|are|can|bring|know|understand|enjoy)|we (?:expect|require)|fluent|proficien\w*|ability to|track record)\b/i
  return unique(fragments.filter((value) => value.length <= 500 && cue.test(value)), 32)
}

/**
 * A source can be safely analysed when it contains enough grounded text and
 * at least one explicit requirement signal. The portal does not always expose
 * stable requirement/responsibility headings, so heading arrays alone are not
 * a reliable completeness gate.
 */
export function hasRunnableOfferSourceContent(source: {
  text?: string
  description?: string
  requirements?: readonly string[]
  responsibilities?: readonly string[]
}) {
  const text = typeof source.text === 'string' ? source.text : typeof source.description === 'string' ? source.description : ''
  const requirements = Array.isArray(source.requirements) ? source.requirements : []
  const responsibilities = Array.isArray(source.responsibilities) ? source.responsibilities : []
  return text.trim().length >= 260 && (requirements.length > 0 || responsibilities.length > 0 || extractExplicitRequirementLines(text).length > 0)
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
  const languageRequirements = lines.filter((line) => /^(?:language|język)\s*:/i.test(withoutHeadingMarker(line)))
  const requirements = unique([...sectionRequirements, ...languageRequirements, ...extractExplicitRequirementLines(unsectionedLines(lines).join('\n'))])
  const explicitResponsibilities = valuesFor(lines, 'responsibilities')
  const roleDescription = valuesFor(lines, 'description')
  const responsibilities = explicitResponsibilities.length > 0 ? explicitResponsibilities : unique(roleDescription)
  const benefits = valuesFor(lines, 'benefits')
  const sourceQuality = description.length > 260 && requirements.length > 0 && responsibilities.length > 0 ? 'full' : 'partial'
  const missingInformation = [requirements.length ? null : 'wymagania', responsibilities.length ? null : 'zakres obowiązków', benefits.length ? null : 'benefity'].filter((value): value is string => Boolean(value))
  const structured = structuredJobMetadata(html)
  const labeled = labeledMetadata(lines)
  const field = (name: string) => typeof imported[name] === 'string' && imported[name].trim() ? imported[name].trim() : undefined
  // Visible, labelled portal metadata is more authoritative than generic
  // JSON-LD employmentType values such as FULL_TIME.
  const metadata = (name: keyof typeof structured) => field(name) ?? labeled[name] ?? structured[name]
  return { offerId, sourceUrl, status: sourceQuality === 'full' ? 'completed' : 'partial', sourceQuality, title: title || field('title'), company: field('company'), location: metadata('location'), workMode: metadata('workMode'), contractType: metadata('contractType'), salary: metadata('salary'), description, requirements, responsibilities, benefits, missingInformation, warnings: sourceQuality === 'partial' ? ['Znaleziono tylko część znormalizowanej treści oferty.'] : [], fetchedAt: new Date().toISOString() }
}

import { analysisCategories, type AnalysisOutput } from './jobAnalysisOutputSchema.ts'

export const ANALYSIS_CRITERIA_CONTRACT_VERSION = 'jobmatch-offer-criteria-r1'

export type AnalysisCriteriaManifest = {
  contractVersion: typeof ANALYSIS_CRITERIA_CONTRACT_VERSION
  criteria: Record<(typeof analysisCategories)[number], Array<{ id: string; canonicalKey: string; requirement: string }>>
}

type ManifestCategory = (typeof analysisCategories)[number]
type OfferSnapshotInput = { text?: unknown; requirements?: unknown; responsibilities?: unknown; benefits?: unknown }

const categoryOrder: ManifestCategory[] = ['experience', 'skills', 'preferences', 'growth']
const compact = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const normalizedKey = (value: string) => value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)

function categoryForRequirement(value: string): ManifestCategory {
  const text = value.toLocaleLowerCase('pl-PL')
  if (/\b(zdal|hybryd|stacjon|b2b|freelance|umow|lokaliz|biur|relok|wynagrodz|salary)\b/.test(text)) return 'preferences'
  if (/\b(rozwoj|awans|junior|senior|lead|manager|kierown|mentoring)\b/.test(text)) return 'growth'
  if (/\b(do[śs]wiadczen|lat\w*|komercyj|bran[żz]|domen|sektor|bankow|finans)\b/.test(text)) return 'experience'
  return 'skills'
}

function fallbackRequirement(category: ManifestCategory, title: string) {
  const role = title ? ` dla roli ${title}` : ''
  if (category === 'experience') return `Adekwatne doświadczenie zawodowe${role}.`
  if (category === 'skills') return `Kompetencje wymagane${role}.`
  if (category === 'preferences') return `Warunki pracy i współpracy${role}.`
  return `Kierunek roli i potencjał rozwoju${role}.`
}

/**
 * The application, not the model, owns the requirement list.  It derives a
 * stable bounded manifest from the frozen normalized offer snapshot.  AI may
 * subsequently classify evidence only for these exact entries.
 */
export function buildDeterministicOfferManifest(offer: Record<string, unknown>, snapshot: OfferSnapshotInput): AnalysisCriteriaManifest {
  const title = compact(offer.title)
  const candidates = [
    ...(Array.isArray(snapshot.requirements) ? snapshot.requirements : []),
    ...(Array.isArray(snapshot.responsibilities) ? snapshot.responsibilities : []),
  ].map(compact).filter(Boolean).slice(0, 32)
  const result = Object.fromEntries(categoryOrder.map((category) => [category, [] as AnalysisCriteriaManifest['criteria'][ManifestCategory]])) as AnalysisCriteriaManifest['criteria']
  const used = new Set<string>()
  for (const requirement of candidates) {
    const category = categoryForRequirement(requirement)
    if (result[category].length >= 8) continue
    const base = normalizedKey(requirement) || `${category}-requirement`
    let suffix = 1
    let key = `req:${category}-${base}`.slice(0, 120)
    while (used.has(key)) { suffix += 1; key = `req:${category}-${base.slice(0, Math.max(1, 116 - String(suffix).length))}-${suffix}` }
    used.add(key)
    result[category].push({ id: key, canonicalKey: key, requirement })
  }
  for (const category of categoryOrder) {
    if (result[category].length) continue
    const key = `req:${category}-baseline`
    result[category].push({ id: key, canonicalKey: key, requirement: fallbackRequirement(category, title) })
  }
  return { contractVersion: ANALYSIS_CRITERIA_CONTRACT_VERSION, criteria: result }
}

export function manifestFromAnalysis(criteria: AnalysisOutput['criteria']): AnalysisCriteriaManifest {
  return {
    contractVersion: ANALYSIS_CRITERIA_CONTRACT_VERSION,
    criteria: Object.fromEntries(analysisCategories.map((category) => [category, criteria[category].map(({ id, canonicalKey, requirement }) => ({ id, canonicalKey, requirement }))])) as AnalysisCriteriaManifest['criteria'],
  }
}

export function isAnalysisCriteriaManifest(value: unknown): value is AnalysisCriteriaManifest {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (data.contractVersion !== ANALYSIS_CRITERIA_CONTRACT_VERSION || !data.criteria || typeof data.criteria !== 'object') return false
  const criteria = data.criteria as Record<string, unknown>
  const keys = new Set<string>()
  return analysisCategories.every((category) => Array.isArray(criteria[category]) && criteria[category].length > 0 && criteria[category].length <= 12 && (criteria[category] as unknown[]).every((item) => {
    if (!item || typeof item !== 'object') return false
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.canonicalKey !== 'string' || typeof entry.requirement !== 'string' || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(entry.id) || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(entry.canonicalKey) || !entry.requirement.trim() || keys.has(entry.canonicalKey)) return false
    keys.add(entry.canonicalKey)
    return true
  }))
}

/** The provider may classify evidence, but cannot add, remove or rename offer requirements. */
export function outputMatchesManifest(criteria: AnalysisOutput['criteria'], manifest: AnalysisCriteriaManifest) {
  return analysisCategories.every((category) => {
    const expected = manifest.criteria[category]
    const actual = criteria[category]
    return actual.length === expected.length && actual.every((criterion, index) => criterion.id === expected[index].id && criterion.canonicalKey === expected[index].canonicalKey && criterion.requirement === expected[index].requirement)
  })
}

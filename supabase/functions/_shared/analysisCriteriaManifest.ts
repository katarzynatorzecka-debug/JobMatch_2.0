import { analysisCategories, type AnalysisOutput } from './jobAnalysisOutputSchema.ts'
import { extractExplicitRequirementLines } from './offerSourceNormalizer.ts'
import type { OfferIntelligenceRubric } from './offerIntelligence.ts'

export const ANALYSIS_CRITERIA_CONTRACT_VERSION = 'jobmatch-offer-criteria-r2'

type ManifestCategory = (typeof analysisCategories)[number]
type CriterionOrigin = 'section' | 'text' | 'metadata'
type ManifestCriterion = { id: string; canonicalKey: string; requirement: string }

export type AnalysisCriteriaManifest = {
  contractVersion: typeof ANALYSIS_CRITERIA_CONTRACT_VERSION
  sourceSnapshotHash: string
  quality: {
    explicitCriterionCount: number
    sourceCriterionCount: number
    metadataCriterionCount: number
    omittedCriterionCount: number
    categoriesWithCriteria: ManifestCategory[]
  }
  criteria: Record<ManifestCategory, ManifestCriterion[]>
}

type OfferSnapshotInput = { sourceQuality?: unknown; text?: unknown; requirements?: unknown; responsibilities?: unknown; benefits?: unknown; missingInformation?: unknown }
type Candidate = { value: string; origin: CriterionOrigin; category?: ManifestCategory }

const categoryOrder: ManifestCategory[] = ['experience', 'skills', 'preferences', 'growth']
const maxCriteriaPerCategory = 32
const maxCriteriaTotal = 64
const compact = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const normalizedKey = (value: string) => value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  return value.map(compact).filter((item) => {
    const key = normalizedKey(item)
    if (!key || used.has(key)) return false
    used.add(key)
    return true
  })
}

export function canonicalOfferSourceSnapshot(snapshot: OfferSnapshotInput) {
  return {
    sourceQuality: snapshot.sourceQuality === 'full' ? 'full' : 'partial',
    text: compact(snapshot.text).slice(0, 18_000),
    requirements: uniqueStrings(snapshot.requirements),
    responsibilities: uniqueStrings(snapshot.responsibilities),
    benefits: uniqueStrings(snapshot.benefits),
    missingInformation: uniqueStrings(snapshot.missingInformation),
  }
}

function categoryForRequirement(value: string): ManifestCategory {
  const text = value.toLocaleLowerCase('pl-PL')
  if (/\b(zdal|remote|hybryd|hybrid|stacjon|onsite|b2b|freelance|umow|contract|part-time|full-time|lokaliz|location|biur|office|relok|wynagrodz|salary)\b/.test(text)) return 'preferences'
  if (/\b(rozwoj|growth|awans|junior|senior|lead|manager|kierown|mentoring|strategic|architect|owner)\b/.test(text)) return 'growth'
  if (/\b(do[śs]wiadczen|experience|lat\w*|years?|komercyj|commercial|bran[żz]|industry|domen|domain|sektor|sector|bankow|finans|track record)\b/.test(text)) return 'experience'
  return 'skills'
}

function offerMetadataCandidates(offer: Record<string, unknown>): Candidate[] {
  const values: Array<[string, string, ManifestCategory]> = [
    ['location', 'Lokalizacja', 'preferences'],
    ['workMode', 'Tryb pracy', 'preferences'],
    ['contractType', 'Forma współpracy', 'preferences'],
    ['salary', 'Wynagrodzenie', 'preferences'],
    ['seniority', 'Poziom stanowiska', 'growth'],
    ['title', 'Kierunek roli', 'growth'],
  ]
  return values.flatMap(([field, label, category]) => {
    const value = compact(offer[field])
    return value ? [{ value: `${label}: ${value}`, origin: 'metadata' as const, category }] : []
  })
}

/** A stable source hash does not depend on object key order, whitespace or duplicate list entries. */
export function canonicalSourceHashInput(snapshot: OfferSnapshotInput) {
  return JSON.stringify(canonicalOfferSourceSnapshot(snapshot))
}

/**
 * The application, not the model, owns the requirement list. The manifest is
 * derived from explicit source sections, explicit requirement statements in
 * the frozen text, and factual offer metadata. No synthetic baseline criteria
 * are added when a category is absent.
 */
export function buildDeterministicOfferManifest(offer: Record<string, unknown>, snapshot: OfferSnapshotInput, sourceSnapshotHash: string): AnalysisCriteriaManifest {
  const candidates: Candidate[] = [
    ...uniqueStrings(snapshot.requirements).map((value) => ({ value, origin: 'section' as const })),
    ...uniqueStrings(snapshot.responsibilities).map((value) => ({ value, origin: 'section' as const })),
    ...extractExplicitRequirementLines(compact(snapshot.text)).map((value) => ({ value, origin: 'text' as const })),
    ...offerMetadataCandidates(offer),
  ]
  const result = Object.fromEntries(categoryOrder.map((category) => [category, [] as ManifestCriterion[]])) as AnalysisCriteriaManifest['criteria']
  const origins = new Map<string, CriterionOrigin>()
  const seen = new Set<string>()
  let omittedCriterionCount = 0
  for (const candidate of candidates) {
    const category = candidate.category ?? categoryForRequirement(candidate.value)
    const semanticKey = normalizedKey(candidate.value)
    if (!semanticKey || seen.has(semanticKey)) continue
    seen.add(semanticKey)
    if (result[category].length >= maxCriteriaPerCategory || categoryOrder.reduce((total, name) => total + result[name].length, 0) >= maxCriteriaTotal) { omittedCriterionCount += 1; continue }
    origins.set(semanticKey, candidate.origin)
    const key = `req:${category}-${semanticKey}`.slice(0, 120)
    result[category].push({ id: key, canonicalKey: key, requirement: candidate.value })
  }
  const entries = categoryOrder.flatMap((category) => result[category])
  const sourceCriterionCount = [...origins.values()].filter((origin) => origin !== 'metadata').length
  return {
    contractVersion: ANALYSIS_CRITERIA_CONTRACT_VERSION,
    sourceSnapshotHash,
    quality: {
      explicitCriterionCount: entries.length,
      sourceCriterionCount,
      metadataCriterionCount: entries.length - sourceCriterionCount,
      omittedCriterionCount,
      categoriesWithCriteria: categoryOrder.filter((category) => result[category].length > 0),
    },
    criteria: result,
  }
}

export function isManifestSufficientForAnalysis(manifest: AnalysisCriteriaManifest) {
  return manifest.quality.sourceCriterionCount > 0 && manifest.quality.omittedCriterionCount === 0
}

export function manifestFromAnalysis(criteria: AnalysisOutput['criteria'], sourceSnapshotHash: string): AnalysisCriteriaManifest {
  const result = Object.fromEntries(analysisCategories.map((category) => [category, criteria[category].map(({ id, canonicalKey, requirement }) => ({ id, canonicalKey, requirement }))])) as AnalysisCriteriaManifest['criteria']
  const count = analysisCategories.reduce((total, category) => total + result[category].length, 0)
  return { contractVersion: ANALYSIS_CRITERIA_CONTRACT_VERSION, sourceSnapshotHash, quality: { explicitCriterionCount: count, sourceCriterionCount: count, metadataCriterionCount: 0, omittedCriterionCount: 0, categoriesWithCriteria: analysisCategories.filter((category) => result[category].length > 0) }, criteria: result }
}

/**
 * Temporary assessment adapter for the existing candidate-output contract.
 * The persisted source of truth is the richer OfferIntelligenceRubric; this
 * projection carries only the fields the pre-vNEXT assessment still accepts.
 */
export function manifestFromOfferIntelligenceRubric(rubric: OfferIntelligenceRubric): AnalysisCriteriaManifest {
  const result = Object.fromEntries(analysisCategories.map((category) => [category, [] as ManifestCriterion[]])) as AnalysisCriteriaManifest['criteria']
  for (const criterion of rubric.criteria) result[criterion.category].push({ id: criterion.id, canonicalKey: criterion.canonicalKey, requirement: criterion.statement })
  const count = analysisCategories.reduce((total, category) => total + result[category].length, 0)
  return {
    contractVersion: ANALYSIS_CRITERIA_CONTRACT_VERSION,
    sourceSnapshotHash: rubric.sourceSnapshotHash,
    quality: {
      explicitCriterionCount: count,
      sourceCriterionCount: count,
      metadataCriterionCount: 0,
      omittedCriterionCount: 0,
      categoriesWithCriteria: analysisCategories.filter((category) => result[category].length > 0),
    },
    criteria: result,
  }
}

export function isAnalysisCriteriaManifest(value: unknown): value is AnalysisCriteriaManifest {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (data.contractVersion !== ANALYSIS_CRITERIA_CONTRACT_VERSION || typeof data.sourceSnapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(data.sourceSnapshotHash) || !data.quality || typeof data.quality !== 'object' || !data.criteria || typeof data.criteria !== 'object') return false
  const criteria = data.criteria as Record<string, unknown>
  const quality = data.quality as Record<string, unknown>
  const keys = new Set<string>()
  const validCriteria = analysisCategories.every((category) => Array.isArray(criteria[category]) && criteria[category].length <= maxCriteriaPerCategory && (criteria[category] as unknown[]).every((item) => {
    if (!item || typeof item !== 'object') return false
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.canonicalKey !== 'string' || typeof entry.requirement !== 'string' || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(entry.id) || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(entry.canonicalKey) || !entry.requirement.trim() || keys.has(entry.canonicalKey)) return false
    keys.add(entry.canonicalKey)
    return true
  }))
  if (!validCriteria || keys.size === 0) return false
  const categoriesWithCriteria = analysisCategories.filter((category) => (criteria[category] as unknown[]).length > 0)
  return Number.isInteger(quality.explicitCriterionCount) && quality.explicitCriterionCount === keys.size
    && Number.isInteger(quality.sourceCriterionCount) && Number(quality.sourceCriterionCount) >= 0 && Number(quality.sourceCriterionCount) <= keys.size
    && Number.isInteger(quality.metadataCriterionCount) && Number(quality.metadataCriterionCount) === keys.size - Number(quality.sourceCriterionCount)
    && Number.isInteger(quality.omittedCriterionCount) && Number(quality.omittedCriterionCount) >= 0
    && Array.isArray(quality.categoriesWithCriteria) && JSON.stringify(quality.categoriesWithCriteria) === JSON.stringify(categoriesWithCriteria)
}

/** The provider may classify evidence, but cannot add, remove or rename offer requirements. */
export function outputMatchesManifest(criteria: AnalysisOutput['criteria'], manifest: AnalysisCriteriaManifest) {
  return analysisCategories.every((category) => {
    const expected = manifest.criteria[category]
    const actual = criteria[category]
    return actual.length === expected.length && actual.every((criterion, index) => criterion.id === expected[index].id && criterion.canonicalKey === expected[index].canonicalKey && criterion.requirement === expected[index].requirement)
  })
}

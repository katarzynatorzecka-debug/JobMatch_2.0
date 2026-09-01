import { analysisCategories, type AnalysisOutput } from './jobAnalysisOutputSchema.ts'

export const ANALYSIS_CRITERIA_CONTRACT_VERSION = 'jobmatch-offer-criteria-r1'

export type AnalysisCriteriaManifest = {
  contractVersion: typeof ANALYSIS_CRITERIA_CONTRACT_VERSION
  criteria: Record<(typeof analysisCategories)[number], Array<{ id: string; canonicalKey: string; requirement: string }>>
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

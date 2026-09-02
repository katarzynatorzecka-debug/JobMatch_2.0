import type { AnalysisCategory, AnalysisCriteria, AnalysisCriterion } from '../../contracts/jobAnalysis'

const categories: AnalysisCategory[] = ['experience', 'skills', 'preferences', 'growth']
function normalized(value: string) { return value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+#.]+/g, ' ').trim().replace(/\s+/g, ' ') }

/** Bounded semantic fingerprint; the app remains the final guard regardless of AI output. */
export function canonicalRequirementKey(criterion: AnalysisCriterion) {
  const supplied = String(criterion.canonicalKey ?? '').trim().toLocaleLowerCase('pl-PL')
  if (/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(supplied)) return supplied
  // Historical records lacked canonicalKey. Their original req ID is the safe identity;
  // newly generated output always carries a canonicalKey and is semantically deduplicated.
  return normalized(criterion.id)
}
function list(criteria: AnalysisCriteria, category: AnalysisCategory): AnalysisCriterion[] {
  const value = criteria[category]
  return Array.isArray(value) ? value : [{ id: `req:legacy-${category}`, requirement: category, outcome: value.outcome, rationale: value.rationale, profileEvidence: value.evidence, offerEvidence: value.evidence, confidence: value.confidence }]
}
/** One real job requirement has one scoring contribution; duplicate evidence is retained only once. */
export function deduplicateAtomicCriteria(criteria: AnalysisCriteria): Record<AnalysisCategory, AnalysisCriterion[]> {
  const seen = new Set<string>()
  const result = Object.fromEntries(categories.map((category) => [category, []])) as unknown as Record<AnalysisCategory, AnalysisCriterion[]>
  for (const category of categories) for (const raw of list(criteria, category)) {
    if (!raw.id.trim().startsWith('req:')) throw new Error('ANALYSIS_CRITERION_ID_INVALID')
    const canonicalKey = canonicalRequirementKey(raw)
    const criterion = { ...raw, canonicalKey }
    if (!seen.has(canonicalKey)) { seen.add(canonicalKey); result[category].push(criterion); continue }
    // Choosing the most positive of two AI classifications silently inflated a
    // score. A duplicate is an invalid analysis contract, not a tie-breaker.
    throw new Error(`ANALYSIS_CRITERION_DUPLICATE:${canonicalKey}`)
  }
  return result
}

export function assertAtomicCriteria(criteria: AnalysisCriteria) {
  for (const category of categories) for (const item of list(criteria, category)) {
    if (!item.id.trim()) throw new Error('ANALYSIS_CRITERION_ID_REQUIRED')
    if (!item.id.trim().startsWith('req:')) throw new Error('ANALYSIS_CRITERION_ID_INVALID')
    if (item.outcome !== 'UNKNOWN' && !item.offerEvidence.length) throw new Error(`ANALYSIS_CRITERION_OFFER_EVIDENCE_REQUIRED:${item.id}`)
    if ((item.outcome === 'MATCH' || item.outcome === 'PARTIAL') && !item.profileEvidence.length) throw new Error(`ANALYSIS_CRITERION_PROFILE_EVIDENCE_REQUIRED:${item.id}`)
  }
}

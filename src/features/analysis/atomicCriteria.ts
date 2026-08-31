import type { AnalysisCriteria, AnalysisCriterion } from '../../contracts/jobAnalysis'

/** A requirement is scored once only; related candidate facts remain evidence. */
export function assertAtomicCriteria(criteria: AnalysisCriteria) {
  const ids = new Set<string>()
  for (const category of ['experience', 'skills', 'preferences', 'growth'] as const) {
    const values = criteria[category]
    const list: AnalysisCriterion[] = Array.isArray(values) ? values : [{ id: `legacy-${category}`, requirement: category, outcome: values.outcome, rationale: values.rationale, profileEvidence: values.evidence, offerEvidence: values.evidence, confidence: values.confidence }]
    for (const item of list) {
      const id = item.id.trim().toLocaleLowerCase()
      if (!id) throw new Error('ANALYSIS_CRITERION_ID_REQUIRED')
      if (!id.startsWith('req:')) throw new Error('ANALYSIS_CRITERION_ID_INVALID')
      const key = id
      if (ids.has(key)) throw new Error('ANALYSIS_DOUBLE_COUNTED_CRITERION')
      ids.add(key)
    }
  }
}

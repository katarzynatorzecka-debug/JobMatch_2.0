import { analysisCategories, type AnalysisOutput } from './jobAnalysisOutputSchema.ts'
import type { OfferIntelligenceRubric } from './offerIntelligence.ts'

export const CANDIDATE_ASSESSMENT_CONTRACT_VERSION = 'jobmatch-candidate-assessment-r1'

type CandidateAssessmentCriterion = {
  id: string
  canonicalKey: string
  requirement: string
  type: 'required_skill' | 'required_experience' | 'language' | 'responsibility_capability' | 'employment_condition' | 'preferred_qualification'
  importance: 'critical' | 'core' | 'preferred'
  outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN'
  rationale: string
  profileEvidence: string[]
  confidence: number
}

export type CandidateAssessmentOutput = {
  criteria: Record<(typeof analysisCategories)[number], CandidateAssessmentCriterion[]>
  summary: string
  strengths: string[]
  risks: string[]
  missingInformation: string[]
}

const assessmentCriterion = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'canonicalKey', 'requirement', 'type', 'importance', 'outcome', 'rationale', 'profileEvidence', 'confidence'],
  properties: {
    id: { type: 'string', pattern: '^req:[a-z0-9][a-z0-9._-]{0,115}$', maxLength: 120 },
    canonicalKey: { type: 'string', pattern: '^req:[a-z0-9][a-z0-9._-]{0,115}$', maxLength: 120 },
    requirement: { type: 'string', minLength: 1, maxLength: 500 },
    type: { type: 'string', enum: ['required_skill', 'required_experience', 'language', 'responsibility_capability', 'employment_condition', 'preferred_qualification'] },
    importance: { type: 'string', enum: ['critical', 'core', 'preferred'] },
    outcome: { type: 'string', enum: ['MATCH', 'PARTIAL', 'NO_MATCH'] },
    rationale: { type: 'string', minLength: 1, maxLength: 500 },
    profileEvidence: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
  },
}

export const candidateAssessmentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['criteria', 'summary', 'strengths', 'risks', 'missingInformation'],
  properties: {
    criteria: { type: 'object', additionalProperties: false, required: analysisCategories, properties: Object.fromEntries(analysisCategories.map((category) => [category, { type: 'array', maxItems: 64, items: assessmentCriterion }])) },
    summary: { type: 'string', minLength: 1, maxLength: 1000 },
    strengths: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    risks: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    missingInformation: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
} as const

export function candidateAssessmentJsonSchemaForRubric(rubric: OfferIntelligenceRubric): Record<string, unknown> {
  const criteriaSchema = candidateAssessmentJsonSchema.properties.criteria as unknown as Record<string, unknown>
  const categorySchemas = criteriaSchema.properties as Record<string, Record<string, unknown>>
  return {
    ...candidateAssessmentJsonSchema,
    properties: {
      ...candidateAssessmentJsonSchema.properties,
      criteria: {
        ...criteriaSchema,
        properties: Object.fromEntries(analysisCategories.map((category) => {
          const expected = rubric.criteria.filter((criterion) => criterion.category === category)
          const count = expected.length
          if (!expected.length) return [category, { ...categorySchemas[category], minItems: 0, maxItems: 0 }]
          const immutableProperties = Object.fromEntries([
            ['id', expected.map((criterion) => criterion.id)],
            ['canonicalKey', expected.map((criterion) => criterion.canonicalKey)],
            ['requirement', expected.map((criterion) => criterion.statement)],
            ['type', expected.map((criterion) => criterion.type)],
            ['importance', expected.map((criterion) => criterion.importance)],
          ].map(([field, values]) => [field, { type: 'string', enum: [...new Set(values as string[])] }]))
          return [category, { ...categorySchemas[category], minItems: count, maxItems: count, items: { ...assessmentCriterion, properties: { ...assessmentCriterion.properties, ...immutableProperties } } }]
        })),
      },
    },
  }
}

const exactKeys = new Set(['id', 'canonicalKey', 'requirement', 'type', 'importance', 'outcome', 'rationale', 'profileEvidence', 'confidence'])
const nonEmptyText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max

function matchesImmutableFields(actual: Record<string, unknown>, expected: OfferIntelligenceRubric['criteria'][number]) {
  return actual.id === expected.id && actual.canonicalKey === expected.canonicalKey && actual.requirement === expected.statement && actual.type === expected.type && actual.importance === expected.importance
}

export function isCandidateAssessmentOutput(value: unknown, rubric: OfferIntelligenceRubric): value is CandidateAssessmentOutput {
  if (!value || typeof value !== 'object') return false
  const output = value as Record<string, unknown>
  if (!nonEmptyText(output.summary, 1000) || !Array.isArray(output.strengths) || output.strengths.length > 8 || !output.strengths.every((item) => nonEmptyText(item, 400)) || !Array.isArray(output.risks) || output.risks.length > 8 || !output.risks.every((item) => nonEmptyText(item, 400)) || !Array.isArray(output.missingInformation) || output.missingInformation.length > 12 || !output.missingInformation.every((item) => nonEmptyText(item, 240)) || !output.criteria || typeof output.criteria !== 'object') return false
  const criteria = output.criteria as Record<string, unknown>
  const expectedByCategory = Object.fromEntries(analysisCategories.map((category) => [category, rubric.criteria.filter((criterion) => criterion.category === category)])) as Record<(typeof analysisCategories)[number], OfferIntelligenceRubric['criteria']>
  return analysisCategories.every((category) => {
    const actual = criteria[category]
    const expected = expectedByCategory[category]
    if (!Array.isArray(actual) || actual.length !== expected.length) return false
    return actual.every((item, index) => {
      if (!item || typeof item !== 'object') return false
      const criterion = item as Record<string, unknown>
      if (Object.keys(criterion).some((key) => !exactKeys.has(key)) || !matchesImmutableFields(criterion, expected[index])) return false
      if (!['MATCH', 'PARTIAL', 'NO_MATCH'].includes(String(criterion.outcome)) || !nonEmptyText(criterion.rationale, 500) || !Number.isInteger(criterion.confidence) || Number(criterion.confidence) < 0 || Number(criterion.confidence) > 100) return false
      if (!Array.isArray(criterion.profileEvidence) || criterion.profileEvidence.length > 8 || !criterion.profileEvidence.every((evidence) => nonEmptyText(evidence, 400))) return false
      return (criterion.outcome === 'MATCH' || criterion.outcome === 'PARTIAL') ? criterion.profileEvidence.length > 0 : true
    })
  })
}

/** Returns an aggregate-only reason for a contract rejection; never includes profile or offer text. */
export function candidateAssessmentValidationDiagnostic(value: unknown, rubric: OfferIntelligenceRubric) {
  if (!value || typeof value !== 'object') return 'top_level_invalid'
  const output = value as Record<string, unknown>
  if (!nonEmptyText(output.summary, 1000)) return 'summary_invalid'
  if (!Array.isArray(output.strengths) || output.strengths.length > 8 || !output.strengths.every((item) => nonEmptyText(item, 400))) return 'strengths_invalid'
  if (!Array.isArray(output.risks) || output.risks.length > 8 || !output.risks.every((item) => nonEmptyText(item, 400))) return 'risks_invalid'
  if (!Array.isArray(output.missingInformation) || output.missingInformation.length > 12 || !output.missingInformation.every((item) => nonEmptyText(item, 240))) return 'missing_information_invalid'
  if (!output.criteria || typeof output.criteria !== 'object') return 'criteria_invalid'
  const criteria = output.criteria as Record<string, unknown>
  const expectedByCategory = Object.fromEntries(analysisCategories.map((category) => [category, rubric.criteria.filter((criterion) => criterion.category === category)])) as Record<(typeof analysisCategories)[number], OfferIntelligenceRubric['criteria']>
  for (const category of analysisCategories) {
    const actual = criteria[category]
    const expected = expectedByCategory[category]
    if (!Array.isArray(actual)) return `${category}_not_array`
    if (actual.length !== expected.length) return `${category}_count_${actual.length}_expected_${expected.length}`
    for (let index = 0; index < actual.length; index += 1) {
      const item = actual[index]
      if (!item || typeof item !== 'object') return `${category}_${index}_item_invalid`
      const criterion = item as Record<string, unknown>
      const extraKeys = Object.keys(criterion).filter((key) => !exactKeys.has(key))
      if (extraKeys.length) return `${category}_${index}_extra_fields`
      const immutableFields = ['id', 'canonicalKey', 'requirement', 'type', 'importance'] as const
      const mismatch = immutableFields.find((field) => !matchesImmutableFields(criterion, expected[index]) && criterion[field] !== expected[index][field as keyof typeof expected[number]])
      if (mismatch) return `${category}_${index}_${mismatch}_changed`
      if (!['MATCH', 'PARTIAL', 'NO_MATCH'].includes(String(criterion.outcome))) return `${category}_${index}_outcome_invalid`
      if (!nonEmptyText(criterion.rationale, 500)) return `${category}_${index}_rationale_invalid`
      if (!Number.isInteger(criterion.confidence) || Number(criterion.confidence) < 0 || Number(criterion.confidence) > 100) return `${category}_${index}_confidence_invalid`
      if (!Array.isArray(criterion.profileEvidence) || criterion.profileEvidence.length > 8 || !criterion.profileEvidence.every((evidence) => nonEmptyText(evidence, 400))) return `${category}_${index}_profile_evidence_invalid`
      if ((criterion.outcome === 'MATCH' || criterion.outcome === 'PARTIAL') && criterion.profileEvidence.length === 0) return `${category}_${index}_profile_evidence_required`
    }
  }
  return 'unknown'
}

export function candidateAssessmentToAnalysisOutput(value: CandidateAssessmentOutput, rubric: OfferIntelligenceRubric): AnalysisOutput {
  const criteria = Object.fromEntries(analysisCategories.map((category) => {
    const expected = rubric.criteria.filter((criterion) => criterion.category === category)
    return [category, value.criteria[category].map((criterion, index) => ({
      id: expected[index].id,
      canonicalKey: expected[index].canonicalKey,
      requirement: expected[index].statement,
      type: expected[index].type,
      importance: expected[index].importance,
      outcome: criterion.outcome,
      rationale: criterion.rationale,
      profileEvidence: criterion.profileEvidence,
      offerEvidence: expected[index].sourceEvidence,
      confidence: criterion.confidence,
    }))]
  })) as AnalysisOutput['criteria']
  return { criteria, summary: value.summary, strengths: value.strengths, risks: value.risks, missingInformation: [...new Set([...value.missingInformation, ...rubric.quality.missingInformation])] }
}

export function buildCandidateAssessmentPrompt(rubric: OfferIntelligenceRubric, candidateContext: unknown, hardFilter: unknown) {
  const counts = Object.fromEntries(analysisCategories.map((category) => [category, rubric.criteria.filter((criterion) => criterion.category === category).length]))
  return `Oceń kandydata wyłącznie względem utrwalonej rubryki pracodawcy. Nie dodawaj, nie usuwaj, nie sortuj i nie zmieniaj żadnego criterion ani pól id, canonicalKey, requirement, type lub importance. Uzupełnij wyłącznie outcome, profileEvidence, rationale i confidence. Każde criterion oceń dokładnie raz. Zwróć dokładnie tyle elementów w każdej tablicy, ile wskazuje kontrakt: experience=${counts.experience}, skills=${counts.skills}, preferences=${counts.preferences}, growth=${counts.growth}. Nie twórz żadnych dodatkowych kryteriów nawet wtedy, gdy zauważysz dodatkowe wymaganie — rubryka jest zamrożona. MATCH wymaga konkretnego dowodu w przekazanym profilu. PARTIAL wymaga dowodu częściowego lub transferowalnego. Jasne wymaganie bez dowodu w profilu oznacza NO_MATCH, a nie UNKNOWN. UNKNOWN nie jest dozwolone dla kompletnej rubryki; jeśli kontekst technicznie nie wystarcza, zakończ ocenę błędem zamiast zgadywać. Nie licz score ani rekomendacji. Career targets nie są doświadczeniem. Hard Filter pozostaje niezależny.
rubric: ${JSON.stringify(rubric)}
candidateContext: ${JSON.stringify(candidateContext)}
hardFilter: ${JSON.stringify(hardFilter)}`
}

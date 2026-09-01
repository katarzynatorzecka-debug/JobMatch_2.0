export const analysisCategories = ['experience', 'skills', 'preferences', 'growth'] as const
const shortText = { type: 'string', minLength: 1, maxLength: 500 }
const criterion = {
  type: 'object', additionalProperties: false,
  required: ['id', 'canonicalKey', 'requirement', 'outcome', 'rationale', 'profileEvidence', 'offerEvidence', 'confidence'],
  properties: {
    id: { type: 'string', pattern: '^req:[a-z0-9][a-z0-9._-]{0,115}$', maxLength: 120 },
    canonicalKey: { type: 'string', pattern: '^req:[a-z0-9][a-z0-9._-]{0,115}$', maxLength: 120 },
    requirement: shortText,
    outcome: { type: 'string', enum: ['MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN'] },
    rationale: shortText,
    profileEvidence: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    offerEvidence: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
  },
}

export const jobAnalysisOutputJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['criteria', 'summary', 'strengths', 'risks', 'missingInformation'],
  properties: {
    criteria: { type: 'object', additionalProperties: false, required: analysisCategories, properties: { experience: { type: 'array', minItems: 1, maxItems: 12, items: criterion }, skills: { type: 'array', minItems: 1, maxItems: 12, items: criterion }, preferences: { type: 'array', minItems: 1, maxItems: 12, items: criterion }, growth: { type: 'array', minItems: 1, maxItems: 12, items: criterion } } },
    summary: { type: 'string', minLength: 1, maxLength: 1000 },
    strengths: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    risks: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    missingInformation: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
} as const

export type CriterionOutcome = 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN'
export type AnalysisOutput = { criteria: Record<(typeof analysisCategories)[number], Array<{ id: string; canonicalKey: string; requirement: string; outcome: CriterionOutcome; rationale: string; profileEvidence: string[]; offerEvidence: string[]; confidence: number }>>; summary: string; strengths: string[]; risks: string[]; missingInformation: string[] }

export function isAnalysisOutput(value: unknown): value is AnalysisOutput {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (typeof data.summary !== 'string' || !data.summary.trim() || !Array.isArray(data.strengths) || !Array.isArray(data.risks) || !Array.isArray(data.missingInformation) || !data.criteria || typeof data.criteria !== 'object') return false
  const criteria = data.criteria as Record<string, unknown>
  const ids = new Set<string>()
  const canonicalKeys = new Set<string>()
  return analysisCategories.every((name) => {
    const entry = criteria[name] as Record<string, unknown> | undefined
    return Array.isArray(entry) && entry.length > 0 && entry.length <= 12 && entry.every((item) => {
      const value = item as Record<string, unknown>
      if (!value || typeof value.id !== 'string' || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(value.id) || typeof value.canonicalKey !== 'string' || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(value.canonicalKey) || ids.has(value.id) || canonicalKeys.has(value.canonicalKey)) return false
      ids.add(value.id)
      canonicalKeys.add(value.canonicalKey)
      return typeof value.requirement === 'string' && value.requirement.trim().length > 0 && ['MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN'].includes(String(value.outcome)) && typeof value.rationale === 'string' && value.rationale.trim().length > 0 && Array.isArray(value.profileEvidence) && value.profileEvidence.every((entry) => typeof entry === 'string' && entry.trim().length > 0) && Array.isArray(value.offerEvidence) && value.offerEvidence.every((entry) => typeof entry === 'string' && entry.trim().length > 0) && Number.isInteger(value.confidence) && Number(value.confidence) >= 0 && Number(value.confidence) <= 100
    })
  })
}

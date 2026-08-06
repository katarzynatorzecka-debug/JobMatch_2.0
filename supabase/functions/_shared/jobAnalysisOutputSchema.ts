export const analysisCategories = ['experience', 'skills', 'preferences', 'growth'] as const
const shortText = { type: 'string', minLength: 1, maxLength: 500 }
const criterion = {
  type: 'object', additionalProperties: false,
  required: ['outcome', 'rationale', 'evidence', 'confidence'],
  properties: {
    outcome: { type: 'string', enum: ['MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN'] },
    rationale: shortText,
    evidence: { type: 'array', maxItems: 6, items: { type: 'string', minLength: 1, maxLength: 400 } },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
  },
}

export const jobAnalysisOutputJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['criteria', 'summary', 'strengths', 'risks', 'missingInformation'],
  properties: {
    criteria: { type: 'object', additionalProperties: false, required: analysisCategories, properties: { experience: criterion, skills: criterion, preferences: criterion, growth: criterion } },
    summary: { type: 'string', minLength: 1, maxLength: 1000 },
    strengths: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    risks: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    missingInformation: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
} as const

export type CriterionOutcome = 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN'
export type AnalysisOutput = { criteria: Record<(typeof analysisCategories)[number], { outcome: CriterionOutcome; rationale: string; evidence: string[]; confidence: number }>; summary: string; strengths: string[]; risks: string[]; missingInformation: string[] }

export function isAnalysisOutput(value: unknown): value is AnalysisOutput {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (typeof data.summary !== 'string' || !data.summary.trim() || !Array.isArray(data.strengths) || !Array.isArray(data.risks) || !Array.isArray(data.missingInformation) || !data.criteria || typeof data.criteria !== 'object') return false
  const criteria = data.criteria as Record<string, unknown>
  return analysisCategories.every((name) => {
    const entry = criteria[name] as Record<string, unknown> | undefined
    return entry && ['MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN'].includes(String(entry.outcome)) && typeof entry.rationale === 'string' && entry.rationale.trim().length > 0 && Array.isArray(entry.evidence) && entry.evidence.every((item) => typeof item === 'string' && item.trim().length > 0) && Number.isInteger(entry.confidence) && Number(entry.confidence) >= 0 && Number(entry.confidence) <= 100
  })
}

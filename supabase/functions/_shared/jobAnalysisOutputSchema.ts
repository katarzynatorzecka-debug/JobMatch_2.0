export const analysisCategories = ['experience', 'skills', 'preferences', 'growth'] as const
const shortText = { type: 'string', minLength: 1, maxLength: 500 }
const category = { type: 'object', additionalProperties: false, required: ['score', 'rationale'], properties: { score: { type: 'integer', minimum: 0, maximum: 100 }, rationale: shortText } }

export const jobAnalysisOutputJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['overallScore', 'categoryScores', 'recommendation', 'summary', 'strengths', 'risks', 'missingInformation'],
  properties: {
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    categoryScores: { type: 'object', additionalProperties: false, required: analysisCategories, properties: { experience: category, skills: category, preferences: category, growth: category } },
    recommendation: { type: 'string', enum: ['Warto aplikować', 'Wymaga sprawdzenia', 'Nie rekomenduję'] },
    summary: { type: 'string', minLength: 1, maxLength: 1000 },
    strengths: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    risks: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 400 } },
    missingInformation: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
} as const

export type AnalysisOutput = { overallScore: number; categoryScores: Record<(typeof analysisCategories)[number], { score: number; rationale: string }>; recommendation: 'Warto aplikować' | 'Wymaga sprawdzenia' | 'Nie rekomenduję'; summary: string; strengths: string[]; risks: string[]; missingInformation: string[] }

export function isAnalysisOutput(value: unknown): value is AnalysisOutput {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (!Number.isInteger(data.overallScore) || (data.overallScore as number) < 0 || (data.overallScore as number) > 100 || !['Warto aplikować', 'Wymaga sprawdzenia', 'Nie rekomenduję'].includes(String(data.recommendation)) || typeof data.summary !== 'string') return false
  if (!Array.isArray(data.strengths) || !Array.isArray(data.risks) || !Array.isArray(data.missingInformation) || !data.categoryScores || typeof data.categoryScores !== 'object') return false
  const categories = data.categoryScores as Record<string, unknown>
  return analysisCategories.every((name) => { const entry = categories[name] as Record<string, unknown> | undefined; return entry && Number.isInteger(entry.score) && (entry.score as number) >= 0 && (entry.score as number) <= 100 && typeof entry.rationale === 'string' })
}

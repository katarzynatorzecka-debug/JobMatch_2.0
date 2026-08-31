const status = { type: 'string', enum: ['extracted', 'inferred', 'unknown'] }
const evidence = { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 180 } }
const confidence = { type: 'number', minimum: 0, maximum: 1 }
const stringField = (maxLength: number) => ({ type: 'object', additionalProperties: false, required: ['value', 'evidence', 'confidence', 'status'], properties: { value: { type: 'string', maxLength }, evidence, confidence, status } })
const listField = (item: Record<string, unknown>, maxItems: number) => ({ type: 'object', additionalProperties: false, required: ['value', 'evidence', 'confidence', 'status'], properties: { value: { type: 'array', maxItems, items: item }, evidence, confidence, status } })
const fact = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: [...Object.keys(properties), 'evidence', 'confidence', 'status'], properties: { ...properties, evidence, confidence, status } })
const recency = { type: 'string', enum: ['current', 'recent', 'earlier', 'unknown'] }
const candidateFacts = {
  type: 'object', additionalProperties: false,
  required: ['totalExperienceYears', 'experienceAreas', 'skills', 'responsibilities', 'domains', 'achievements', 'languages', 'education', 'certifications'],
  properties: {
    totalExperienceYears: { type: 'object', additionalProperties: false, required: ['value', 'evidence', 'confidence', 'status'], properties: { value: { type: ['number', 'null'], minimum: 0, maximum: 60 }, evidence, confidence, status } },
    experienceAreas: { type: 'array', maxItems: 20, items: fact({ area: { type: 'string', minLength: 1, maxLength: 180 }, yearsApprox: { type: ['number', 'null'], minimum: 0, maximum: 60 }, recency }) },
    skills: { type: 'array', maxItems: 40, items: fact({ name: { type: 'string', minLength: 1, maxLength: 80 }, category: { type: ['string', 'null'], maxLength: 80 }, evidenceLevel: { type: 'string', enum: ['professional', 'project', 'learning', 'mentioned'] }, yearsApprox: { type: ['number', 'null'], minimum: 0, maximum: 60 }, recency }) },
    responsibilities: { type: 'array', maxItems: 30, items: fact({ capability: { type: 'string', minLength: 1, maxLength: 180 } }) }, domains: { type: 'array', maxItems: 20, items: fact({ name: { type: 'string', minLength: 1, maxLength: 180 }, yearsApprox: { type: ['number', 'null'], minimum: 0, maximum: 60 } }) }, achievements: { type: 'array', maxItems: 20, items: fact({ capability: { type: 'string', minLength: 1, maxLength: 300 } }) }, languages: { type: 'array', maxItems: 12, items: fact({ name: { type: 'string', minLength: 1, maxLength: 180 }, level: { type: ['string', 'null'], maxLength: 80 } }) }, education: { type: 'array', maxItems: 12, items: fact({ name: { type: 'string', minLength: 1, maxLength: 300 }, issuer: { type: ['string', 'null'], maxLength: 160 } }) }, certifications: { type: 'array', maxItems: 20, items: fact({ name: { type: 'string', minLength: 1, maxLength: 300 }, issuer: { type: ['string', 'null'], maxLength: 160 } }) },
  },
}

export const cvProfileOutputJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['fullName', 'primaryRole', 'alternativeRoles', 'professionalSummary', 'skills', 'locations', 'workModes', 'contractTypes', 'candidateFacts'],
  properties: {
    fullName: stringField(120),
    primaryRole: stringField(120),
    alternativeRoles: listField({ type: 'string', minLength: 1, maxLength: 120 }, 8),
    professionalSummary: stringField(1000),
    skills: listField({ type: 'string', minLength: 1, maxLength: 80 }, 30),
    locations: listField({ type: 'string', minLength: 1, maxLength: 120 }, 12),
    workModes: listField({ type: 'string', enum: ['remote', 'hybrid', 'onsite'] }, 3),
    contractTypes: listField({ type: 'string', enum: ['employment', 'b2b', 'mandate', 'freelance', 'internship'] }, 5),
    candidateFacts,
  },
} as const

type Field = { value: unknown; evidence: unknown; confidence: unknown; status: unknown }
function validField(field: unknown, list: boolean) {
  if (!field || typeof field !== 'object') return false
  const value = field as Field
  const recognized = value.status === 'extracted' || value.status === 'inferred'
  const evidenceList = Array.isArray(value.evidence) ? value.evidence : null
  const evidenceIsValid = evidenceList !== null && evidenceList.length <= 3 && evidenceList.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 180)
  const valueIsPresent = list ? Array.isArray(value.value) && value.value.length > 0 : typeof value.value === 'string' && value.value.trim().length > 0
  return typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1 && (recognized ? evidenceIsValid && evidenceList !== null && evidenceList.length > 0 && valueIsPresent : value.status === 'unknown' && evidenceIsValid && evidenceList !== null && !evidenceList.length && (list ? Array.isArray(value.value) && !value.value.length : value.value === ''))
}

export function isCvProfileOutput(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const mapping = value as Record<string, unknown>
  const scalar = ['fullName', 'primaryRole', 'professionalSummary']
  const lists = ['alternativeRoles', 'skills', 'locations', 'workModes', 'contractTypes']
  const facts = mapping.candidateFacts as Record<string, unknown> | undefined
  const factArrays = ['experienceAreas', 'skills', 'responsibilities', 'domains', 'achievements', 'languages', 'education', 'certifications']
  const validFact = (entry: unknown) => entry && typeof entry === 'object' && ['extracted', 'inferred', 'unknown'].includes(String((entry as Record<string, unknown>).status)) && Array.isArray((entry as Record<string, unknown>).evidence) && ((entry as Record<string, unknown>).evidence as unknown[]).length <= 3
  const totalYears = facts?.totalExperienceYears as Record<string, unknown> | undefined
  const validYears = totalYears ? typeof totalYears.confidence === 'number' && Array.isArray(totalYears.evidence) && (totalYears.status === 'unknown' ? totalYears.value === null && (totalYears.evidence as unknown[]).length === 0 : typeof totalYears.value === 'number' && (totalYears.evidence as unknown[]).length > 0) : false
  return Object.keys(mapping).length === 9 && scalar.every((key) => validField(mapping[key], false)) && lists.every((key) => validField(mapping[key], true)) && Boolean(facts) && validYears && factArrays.every((key) => Array.isArray(facts?.[key]) && (facts?.[key] as unknown[]).every(validFact))
}

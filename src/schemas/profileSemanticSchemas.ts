import { z } from 'zod'

const status = z.enum(['extracted', 'inferred', 'unknown'])
const evidence = z.array(z.string().min(1).max(180)).max(3)

function stringField(maxLength: number) {
  return z.object({ value: z.string().max(maxLength), evidence, confidence: z.number().min(0).max(1), status }).superRefine((field, context) => {
    if (field.status !== 'unknown' && (!field.value.trim() || !field.evidence.length)) context.addIssue({ code: 'custom', message: 'Wartość rozpoznana wymaga dowodu z CV.' })
    if (field.status === 'unknown' && (field.value.trim() || field.evidence.length)) context.addIssue({ code: 'custom', message: 'Pole unknown nie może zawierać wartości ani dowodów.' })
  })
}

function listField<T extends z.ZodTypeAny>(item: T, maxItems: number) {
  return z.object({ value: z.array(item).max(maxItems), evidence, confidence: z.number().min(0).max(1), status }).superRefine((field, context) => {
    if (field.status !== 'unknown' && (!field.value.length || !field.evidence.length)) context.addIssue({ code: 'custom', message: 'Lista rozpoznana wymaga dowodu z CV.' })
    if (field.status === 'unknown' && (field.value.length || field.evidence.length)) context.addIssue({ code: 'custom', message: 'Pole unknown nie może zawierać wartości ani dowodów.' })
  })
}

const factStatus = status
const factEvidence = evidence
const factConfidence = z.number().min(0).max(1)
const fact = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, evidence: factEvidence, confidence: factConfidence, status: factStatus }).strict().superRefine((item: any, context) => {
  if (item.status !== 'unknown' && !item.evidence.length) context.addIssue({ code: 'custom', message: 'Fakt wymaga krótkiego dowodu z CV.' })
})
const factRecency = z.enum(['current', 'recent', 'earlier', 'unknown'])
const semanticExperienceArea = fact({ area: z.string().min(1).max(180), yearsApprox: z.number().min(0).max(60).nullable(), recency: factRecency })
const semanticSkill = fact({ name: z.string().min(1).max(80), category: z.string().max(80).nullable(), evidenceLevel: z.enum(['professional', 'project', 'learning', 'mentioned']), yearsApprox: z.number().min(0).max(60).nullable(), recency: factRecency })
const semanticCapability = fact({ capability: z.string().min(1).max(180) })
const semanticAchievement = fact({ capability: z.string().min(1).max(300) })
const semanticDomain = fact({ name: z.string().min(1).max(180), yearsApprox: z.number().min(0).max(60).nullable() })
const semanticLanguage = fact({ name: z.string().min(1).max(180), level: z.string().max(80).nullable() })
const semanticCredential = fact({ name: z.string().min(1).max(300), issuer: z.string().max(160).nullable() })
const semanticCandidateFacts = z.object({
  totalExperienceYears: z.object({ value: z.number().min(0).max(60).nullable(), evidence, confidence: z.number().min(0).max(1), status }).strict(),
  experienceAreas: z.array(semanticExperienceArea).max(20), skills: z.array(semanticSkill).max(40), responsibilities: z.array(semanticCapability).max(30), domains: z.array(semanticDomain).max(20), achievements: z.array(semanticAchievement).max(20), languages: z.array(semanticLanguage).max(12), education: z.array(semanticCredential).max(12), certifications: z.array(semanticCredential).max(20),
}).strict()

export const semanticProfileMappingSchema = z.object({
  fullName: stringField(120),
  primaryRole: stringField(120),
  alternativeRoles: listField(z.string().min(1).max(120), 8),
  professionalSummary: stringField(1000),
  skills: listField(z.string().min(1).max(80), 30),
  locations: listField(z.string().min(1).max(120), 12),
  workModes: listField(z.enum(['remote', 'hybrid', 'onsite']), 3),
  contractTypes: listField(z.enum(['employment', 'b2b', 'mandate', 'freelance', 'internship']), 5),
  candidateFacts: semanticCandidateFacts,
}).strict()

export const semanticProfileResponseSchema = z.object({ mapping: semanticProfileMappingSchema }).strict()
export type SemanticProfileMapping = z.infer<typeof semanticProfileMappingSchema>

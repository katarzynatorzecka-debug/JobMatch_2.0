import { z } from 'zod'

const shortText = z.string().trim().min(1).max(180)
const evidence = z.object({ source: z.enum(['cv', 'user', 'derived']), text: shortText.max(180), section: z.string().trim().max(80).nullable(), userConfirmed: z.boolean() }).strict()
const evidenceList = z.array(evidence).max(3)
const recency = z.enum(['current', 'recent', 'earlier', 'unknown'])
const years = z.number().min(0).max(60).nullable()
const hard = <T extends z.ZodTypeAny>(value: T) => z.object({ value, isHard: z.boolean(), source: z.enum(['cv', 'user', 'derived']), userConfirmed: z.boolean() }).strict()

export const profileIntelligenceSchema = z.object({
  schemaVersion: z.literal(2),
  candidateFacts: z.object({
    professionalSummary: z.string().max(1000),
    totalExperienceYears: years,
    experienceAreas: z.array(z.object({ area: shortText, yearsApprox: years, recency, evidence: evidenceList }).strict()).max(20),
    skills: z.array(z.object({ name: shortText.max(80), category: z.string().trim().max(80).nullable(), evidenceLevel: z.enum(['professional', 'project', 'learning', 'mentioned']), yearsApprox: years, recency, evidence: evidenceList }).strict()).max(40),
    responsibilities: z.array(z.object({ capability: shortText, evidence: evidenceList }).strict()).max(30),
    domains: z.array(z.object({ name: shortText, yearsApprox: years, evidence: evidenceList }).strict()).max(20),
    achievements: z.array(z.object({ capability: shortText.max(300), evidence: evidenceList }).strict()).max(20),
    languages: z.array(z.object({ name: shortText, level: z.string().trim().max(80).nullable(), evidence: evidenceList }).strict()).max(12),
    education: z.array(z.object({ name: shortText.max(300), issuer: z.string().trim().max(160).nullable(), evidence: evidenceList }).strict()).max(12),
    certifications: z.array(z.object({ name: shortText.max(300), issuer: z.string().trim().max(160).nullable(), evidence: evidenceList }).strict()).max(20),
  }).strict(),
  careerTargets: z.object({ primaryRoles: z.array(shortText.max(120)).max(5), alternativeRoles: z.array(shortText.max(120)).max(12), targetSeniority: z.array(z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'unknown'])).min(1).max(3), careerDirections: z.array(shortText.max(180)).max(8), transitionContext: z.string().trim().max(500).nullable() }).strict(),
  workPreferences: z.object({ locations: z.array(hard(shortText.max(120))).max(12), workModes: z.array(hard(z.enum(['remote', 'hybrid', 'onsite']))).max(3), employmentTypes: z.array(hard(z.enum(['employment', 'b2b', 'mandate', 'freelance', 'internship']))).max(5), minimumSalary: z.number().nonnegative().finite().nullable(), availability: z.string().trim().max(160).nullable(), relocation: z.string().trim().max(160).nullable() }).strict(),
  constraints: z.object({ mustHave: z.array(shortText.max(160)).max(20), blacklist: z.array(shortText.max(160)).max(20) }).strict(),
  matchingPriorities: z.array(z.enum(['experience', 'skills', 'preferences', 'growth'])).length(4),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.matchingPriorities).size !== 4) ctx.addIssue({ code: 'custom', path: ['matchingPriorities'], message: 'Każdy priorytet musi wystąpić raz.' })
  const fields = [value.candidateFacts.experienceAreas, value.candidateFacts.skills, value.candidateFacts.responsibilities, value.candidateFacts.domains, value.candidateFacts.achievements, value.candidateFacts.languages, value.candidateFacts.education, value.candidateFacts.certifications]
  fields.forEach((entries, index) => entries.forEach((entry, itemIndex) => {
    if (!entry.evidence.length) ctx.addIssue({ code: 'custom', path: ['candidateFacts', index, itemIndex, 'evidence'], message: 'Fakt wymaga krótkiego dowodu.' })
  }))
})

export type ProfileIntelligenceInput = z.infer<typeof profileIntelligenceSchema>

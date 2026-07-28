import { z } from 'zod'
import type { UserProfile } from '../contracts/profile'

export const profilePriorityValues = ['experience', 'skills', 'preferences', 'growth'] as const
const workModeSchema = z.enum(['remote', 'hybrid', 'onsite'])
const contractTypeSchema = z.enum(['employment', 'b2b', 'mandate', 'freelance', 'internship'])

export function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

export function hasDuplicates(values: string[]) {
  return new Set(values.map((value) => value.toLocaleLowerCase())).size !== values.length
}

export function normalizeProfile(input: Partial<UserProfile>): UserProfile {
  return {
    primaryRole: (input.primaryRole ?? '').trim().replace(/\s+/g, ' '),
    alternativeRoles: normalizeList(input.alternativeRoles),
    experienceSummary: (input.experienceSummary ?? '').trim().replace(/\s+/g, ' '),
    skills: normalizeList(input.skills),
    acceptedWorkModes: input.acceptedWorkModes ?? [],
    acceptedContractTypes: input.acceptedContractTypes ?? [],
    acceptedLocations: normalizeList(input.acceptedLocations),
    minimumSalary: input.minimumSalary === null || input.minimumSalary === undefined ? null : Number(input.minimumSalary),
    studentStatusAvailable: Boolean(input.studentStatusAvailable),
    excludedContractTypes: input.excludedContractTypes ?? [],
    excludedWorkModes: input.excludedWorkModes ?? [],
    excludedKeywords: normalizeList(input.excludedKeywords),
    requiresStudentStatus: Boolean(input.requiresStudentStatus),
    additionalMustHave: (input.additionalMustHave ?? '').trim(),
    additionalBlacklist: (input.additionalBlacklist ?? '').trim(),
    priorities: input.priorities ?? ['experience', 'skills', 'preferences', 'growth'],
  }
}

const optionalText = z.string().max(800)
const baseProfileShape = {
  primaryRole: z.string().min(2, 'Wpisz rolę główną.').max(120, 'Rola główna jest zbyt długa.'),
  alternativeRoles: z.array(z.string().min(1).max(120)).max(8),
  experienceSummary: z.string().min(20, 'Podsumowanie powinno mieć co najmniej 20 znaków.').max(1000),
  skills: z.array(z.string().min(1).max(80)).min(1, 'Dodaj co najmniej jedną umiejętność.').max(30),
  acceptedWorkModes: z.array(workModeSchema),
  acceptedContractTypes: z.array(contractTypeSchema),
  acceptedLocations: z.array(z.string().min(1).max(120)).max(12),
  minimumSalary: z.number().nonnegative().finite().nullable(),
  studentStatusAvailable: z.boolean(),
  excludedContractTypes: z.array(contractTypeSchema),
  excludedWorkModes: z.array(workModeSchema),
  excludedKeywords: z.array(z.string().min(1).max(100)).max(20),
  requiresStudentStatus: z.boolean(),
  additionalMustHave: optionalText,
  additionalBlacklist: optionalText,
  priorities: z.array(z.enum(profilePriorityValues)).length(4),
}

function withDuplicateRules<T extends z.ZodObject<typeof baseProfileShape>>(schema: T) {
  return schema.superRefine((value, context) => {
    const lists: Array<[keyof typeof baseProfileShape, string[]]> = [
      ['alternativeRoles', value.alternativeRoles], ['skills', value.skills], ['acceptedLocations', value.acceptedLocations], ['excludedKeywords', value.excludedKeywords],
    ]
    lists.forEach(([field, entries]) => {
      if (hasDuplicates(entries)) context.addIssue({ code: 'custom', path: [field], message: 'Lista nie może zawierać duplikatów.' })
    })
    if (new Set(value.priorities).size !== 4) context.addIssue({ code: 'custom', path: ['priorities'], message: 'Każdy priorytet musi wystąpić dokładnie raz.' })
  })
}

export const userProfileSchema = withDuplicateRules(z.object(baseProfileShape))

const draftValuesSchema = z.object({
  ...baseProfileShape,
  primaryRole: z.string().max(120),
  experienceSummary: z.string().max(1000),
  skills: z.array(z.string().min(1).max(80)).max(30),
})

export const userProfileDraftSchema = z.object({
  values: withDuplicateRules(draftValuesSchema),
  confidence: z.object({
    primaryRole: z.enum(['high', 'medium', 'low', 'missing', 'manual']),
    alternativeRoles: z.enum(['high', 'medium', 'low', 'missing', 'manual']),
    experienceSummary: z.enum(['high', 'medium', 'low', 'missing', 'manual']),
    skills: z.enum(['high', 'medium', 'low', 'missing', 'manual']),
  }),
  warnings: z.array(z.string().min(1).max(300)).max(12),
  source: z.enum(['pdf', 'pasted-text']),
  requiresAcceptance: z.literal(true),
})

export function validateUserProfile(input: Partial<UserProfile>) {
  return userProfileSchema.safeParse(normalizeProfile(input))
}

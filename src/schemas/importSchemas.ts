import { z } from 'zod'

const optionalText = z.string().trim().min(1).max(500).optional()

export const importedJobOfferSchema = z.object({
  id: z.string().min(8).max(120),
  title: z.string().trim().min(2).max(180),
  company: z.string().trim().min(2).max(180),
  location: optionalText,
  workMode: optionalText,
  contractType: optionalText,
  salary: optionalText,
  sourceUrl: z.url().max(1400).optional(),
  sourceLabel: optionalText,
  missingFields: z.array(z.string().min(1).max(80)).max(8),
  warnings: z.array(z.string().min(1).max(220)).max(8),
})

export const importWarningSchema = z.object({
  code: z.enum(['missing-field', 'duplicate', 'partial-parse', 'unsupported-layout']),
  message: z.string().min(1).max(300),
  offerId: z.string().min(8).max(120).optional(),
})

export const importedReportSchema = z.object({
  version: z.literal(1),
  source: z.literal('rocketjobs-eml'),
  fileName: z.string().trim().min(1).max(260),
  importedAt: z.string().datetime(),
  offers: z.array(importedJobOfferSchema).max(100),
  warnings: z.array(importWarningSchema).max(100),
})

export function validateImportedReport(input: unknown) {
  return importedReportSchema.safeParse(input)
}

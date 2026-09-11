import { z } from 'zod'
import { createImportedReport, metadataForImportSource } from '../features/import/importReportContract'

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

const reportFields = {
  fileName: z.string().trim().min(1).max(260),
  importedAt: z.string().datetime({ offset: true }),
  offers: z.array(importedJobOfferSchema).max(100),
  warnings: z.array(importWarningSchema).max(100),
}

const legacyImportedReportSchema = z.object({
  version: z.literal(1),
  source: z.enum(['rocketjobs-eml', 'job-url']),
  ...reportFields,
}).transform((report) => createImportedReport({
  ...report,
  ...metadataForImportSource(report.source),
}))

const currentImportedReportSchema = z.object({
  version: z.literal(2),
  source: z.enum(['rocketjobs-eml', 'rocketjobs-gmail', 'job-url']),
  reportProvider: z.literal('rocketjobs'),
  acquisitionChannel: z.enum(['eml', 'gmail', 'url']),
  ...reportFields,
}).superRefine((report, context) => {
  const expected = metadataForImportSource(report.source)
  if (expected.reportProvider !== report.reportProvider || expected.acquisitionChannel !== report.acquisitionChannel) {
    context.addIssue({ code: 'custom', message: 'IMPORT_SOURCE_METADATA_MISMATCH' })
  }
})

export const importedReportSchema = z.union([currentImportedReportSchema, legacyImportedReportSchema])

export function validateImportedReport(input: unknown) {
  return importedReportSchema.safeParse(input)
}

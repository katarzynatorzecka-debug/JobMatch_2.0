import { z } from 'zod'
import { importedJobOfferSchema } from './importSchemas'

const hardFilterReasonSchema = z.object({
  code: z.string().min(1).max(80),
  label: z.string().min(1).max(260),
  category: z.enum(['contract', 'work-mode', 'location', 'salary', 'keyword', 'student-status', 'must-have', 'data-quality']),
  profileValue: z.string().min(1).max(500).optional(),
  offerValue: z.string().min(1).max(500).optional(),
})

export const hardFilterResultSchema = z.object({
  offerId: z.string().min(8).max(120),
  status: z.enum(['pass', 'weak', 'fail']),
  reasons: z.array(hardFilterReasonSchema).max(30),
  missingInformation: z.array(z.string().min(1).max(120)).max(20),
  checkedCriteria: z.array(z.string().min(1).max(120)).max(20),
})

export const filteredJobOfferSchema = z.object({ offer: importedJobOfferSchema, result: hardFilterResultSchema })
export const hardFilterSessionSchema = z.object({ version: z.literal(1), filteredOffers: z.array(filteredJobOfferSchema).max(100) })

export function validateHardFilterSession(input: unknown) {
  return hardFilterSessionSchema.safeParse(input)
}

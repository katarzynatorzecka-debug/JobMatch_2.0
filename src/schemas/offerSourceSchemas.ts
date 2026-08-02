import { z } from 'zod'
import { offerSourceErrorCodes, offerSourceQualities, offerSourceStatuses } from '../contracts/offerSource'

const sourceText = z.string().trim().min(1).max(18_000)
export const offerSourceResultSchema = z.object({
  offerId: z.string().min(1).max(120),
  sourceUrl: z.url().max(1400).optional(),
  status: z.enum(offerSourceStatuses),
  sourceQuality: z.enum(offerSourceQualities),
  title: z.string().trim().min(1).max(500).optional(),
  company: z.string().trim().min(1).max(500).optional(),
  location: z.string().trim().min(1).max(500).optional(),
  workMode: z.string().trim().min(1).max(500).optional(),
  contractType: z.string().trim().min(1).max(500).optional(),
  salary: z.string().trim().min(1).max(500).optional(),
  description: sourceText.optional(),
  requirements: z.array(z.string().trim().min(1).max(1500)).max(80),
  responsibilities: z.array(z.string().trim().min(1).max(1500)).max(80),
  benefits: z.array(z.string().trim().min(1).max(1500)).max(80),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(30),
  warnings: z.array(z.string().trim().min(1).max(500)).max(30),
  fetchedAt: z.string().datetime(),
  errorCode: z.enum(offerSourceErrorCodes).optional(),
}).strict()

export function validateOfferSourceResult(input: unknown) { return offerSourceResultSchema.safeParse(input) }

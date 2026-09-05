import { extractRfc822Content } from '../import/emlExtractor'
import { createImportedReport } from '../import/importReportContract'
import { parseRocketJobsReport } from '../import/rocketJobsReportParser'
import { buildGmailSearchRequest } from './gmailQueryBuilder'
import { decodeGmailRaw } from './gmailRaw'
import {
  GMAIL_MAX_MESSAGE_BYTES,
  GMAIL_MAX_PARALLEL_DOWNLOADS,
  GmailImportError,
  type GmailImportedMessage,
  type GmailMailboxGateway,
  type GmailSearchFilters,
} from './gmailContracts'

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      result[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return result
}

export class GmailImportAdapter {
  constructor(private readonly gateway: GmailMailboxGateway, private readonly now: () => Date = () => new Date()) {}

  search(filters: GmailSearchFilters = {}) {
    return this.gateway.search(buildGmailSearchRequest(filters))
  }

  async importSelected(messageIds: string[]): Promise<GmailImportedMessage[]> {
    const uniqueIds = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))]
    return mapWithConcurrency(uniqueIds, GMAIL_MAX_PARALLEL_DOWNLOADS, async (messageId) => {
      const message = await this.gateway.getRaw(messageId)
      if (message.id !== messageId) throw new GmailImportError('GMAIL_MESSAGE_INVALID')
      if (message.sizeEstimate > GMAIL_MAX_MESSAGE_BYTES) throw new GmailImportError('GMAIL_MESSAGE_TOO_LARGE')
      const extraction = await extractRfc822Content(decodeGmailRaw(message.raw), GMAIL_MAX_MESSAGE_BYTES)
      if (!extraction.success) {
        const tooLarge = extraction.error?.toLocaleLowerCase().includes('zbyt duża')
        throw new GmailImportError(tooLarge ? 'GMAIL_MESSAGE_TOO_LARGE' : 'GMAIL_MESSAGE_INVALID')
      }
      const parsed = parseRocketJobsReport(extraction.text)
      if (!parsed.offers.length) throw new GmailImportError('GMAIL_REPORT_EMPTY')
      return {
        messageId,
        report: createImportedReport({
          reportProvider: 'rocketjobs',
          acquisitionChannel: 'gmail',
          fileName: `gmail-${messageId}.eml`,
          importedAt: this.now().toISOString(),
          offers: parsed.offers,
          warnings: [...parsed.warnings, ...extraction.warnings.map((message) => ({ code: 'partial-parse' as const, message }))],
        }),
      }
    })
  }
}

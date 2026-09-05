import type { ImportedReport } from '../../contracts/import'

export const GMAIL_DEFAULT_LOOKBACK_DAYS = 30
export const GMAIL_MAX_RESULTS = 25
export const GMAIL_MAX_MESSAGE_BYTES = 10 * 1024 * 1024
export const GMAIL_MAX_PARALLEL_DOWNLOADS = 5

export type GmailSearchFilters = {
  sender?: string
  subject?: string
  after?: string
  before?: string
  pageToken?: string
}

export type GmailSearchRequest = {
  query: string
  maxResults: typeof GMAIL_MAX_RESULTS
  pageToken?: string
}

export type GmailMessagePreview = {
  id: string
  sender: string
  subject: string
  receivedAt: string
  sizeEstimate: number
  alreadyImported: boolean
}

export type GmailSearchResult = {
  messages: GmailMessagePreview[]
  nextPageToken?: string
}

export type GmailRawMessage = {
  id: string
  raw: string
  sizeEstimate: number
}

/** Server-side Gmail API boundary. RAW returned here must never cross the Edge Function response boundary. */
export interface GmailMailboxGateway {
  search(request: GmailSearchRequest): Promise<GmailSearchResult>
  getRaw(messageId: string): Promise<GmailRawMessage>
}

export type GmailImportedMessage = {
  messageId: string
  report: ImportedReport
}

export type GmailImportErrorCode =
  | 'GMAIL_QUERY_INVALID'
  | 'GMAIL_DATE_RANGE_INVALID'
  | 'GMAIL_MESSAGE_NOT_FOUND'
  | 'GMAIL_MESSAGE_INVALID'
  | 'GMAIL_MESSAGE_TOO_LARGE'
  | 'GMAIL_REPORT_EMPTY'

export class GmailImportError extends Error {
  constructor(public readonly code: GmailImportErrorCode) {
    super(code)
    this.name = 'GmailImportError'
  }
}

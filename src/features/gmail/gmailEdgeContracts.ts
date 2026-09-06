import type { ImportedReport } from '../../contracts/import'
import type { GmailSearchFilters } from './gmailContracts'

export const GMAIL_ALLOWED_RETURN_TARGETS = ['local', 'staging', 'production'] as const
export { GMAIL_ROCKETJOBS_DEFAULT_SENDER } from './gmailContracts'

export type GmailReturnTarget = (typeof GMAIL_ALLOWED_RETURN_TARGETS)[number]
export type GmailConnectionState = 'disconnected' | 'active' | 'reauth_required'

export type GmailConnectionStatusResponse = {
  state: GmailConnectionState
  maskedEmail?: string
}

export type GmailOAuthStartRequest = {
  returnTarget: GmailReturnTarget
}

export type GmailOAuthStartResponse = {
  authorizationUrl: string
}

export type GmailSearchEdgeRequest = {
  filters?: GmailSearchFilters
}

export type GmailEdgeMessagePreview = {
  messageRef: string
  senderLabel: string
  subject: string
  receivedAt: string
  sizeEstimate: number
  alreadyImported: boolean
}

export type GmailSearchEdgeResponse = {
  messages: GmailEdgeMessagePreview[]
  nextPageToken?: string
}

export type GmailImportSelectedRequest = {
  messageRefs: string[]
}

export type GmailImportedReport = {
  receiptId: string
  messageRef: string
  report: ImportedReport
}

export type GmailImportSelectedResponse = {
  reports: GmailImportedReport[]
}

export type GmailConfirmImportRequest = {
  receiptId: string
  importSessionId: string
}

export type GmailConfirmImportResponse = {
  confirmed: true
}

export type GmailDisconnectResponse = {
  disconnected: true
  remoteRevokeSucceeded: boolean
}

export type GmailEdgeErrorCode =
  | 'GMAIL_NOT_CONNECTED'
  | 'GMAIL_REAUTH_REQUIRED'
  | 'GMAIL_PERMISSION_DENIED'
  | 'GMAIL_RATE_LIMITED'
  | 'GMAIL_TIMEOUT'
  | 'GMAIL_MESSAGE_TOO_LARGE'
  | 'GMAIL_MESSAGE_INVALID'
  | 'GMAIL_REPORT_EMPTY'
  | 'GMAIL_PROVIDER_UNAVAILABLE'
  | 'GMAIL_OAUTH_STATE_INVALID'
  | 'GMAIL_OAUTH_STATE_EXPIRED'
  | 'GMAIL_OAUTH_CANCELLED'

export type GmailEdgeErrorResponse = {
  code: GmailEdgeErrorCode
  retryAfter?: number
}

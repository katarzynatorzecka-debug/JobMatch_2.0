export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const GMAIL_DEFAULT_LOOKBACK_DAYS = 30
export const GMAIL_MAX_RESULTS = 25
export const GMAIL_MAX_MESSAGE_BYTES = 10 * 1024 * 1024
export const GMAIL_MAX_PARALLEL_DOWNLOADS = 5
export const GMAIL_ROCKETJOBS_DEFAULT_SENDER = 'no-reply@rocketjobs.pl'

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

export type ImportedJobOffer = {
  id: string
  title: string
  company: string
  location?: string
  workMode?: string
  contractType?: string
  salary?: string
  sourceUrl?: string
  sourceLabel?: string
  missingFields: string[]
  warnings: string[]
}

export type ImportWarning = {
  code: 'missing-field' | 'duplicate' | 'partial-parse' | 'unsupported-layout'
  message: string
  offerId?: string
}

export type ImportedReport = {
  version: 2
  source: 'rocketjobs-gmail'
  reportProvider: 'rocketjobs'
  acquisitionChannel: 'gmail'
  fileName: string
  importedAt: string
  offers: ImportedJobOffer[]
  warnings: ImportWarning[]
}

export type GmailConnection = {
  id: string
  userId: string
  maskedEmail: string | null
  refreshToken: { ciphertext: string; nonce: string; keyVersion: number }
  grantedScopes: string[]
  status: 'active' | 'reauth_required' | 'revoked'
}

export type StoredOAuthState = {
  id: string
  userId: string
  pkceVerifier: { ciphertext: string; nonce: string; keyVersion: number }
  redirectUriHmac: string
  returnTarget: 'local' | 'staging' | 'production'
}

export type OAuthStateStatus = { expiresAt: string; usedAt: string | null }

export interface GmailStore {
  createOAuthState(input: {
    userId: string
    stateHash: string
    pkceVerifier: StoredOAuthState['pkceVerifier']
    redirectUriHmac: string
    returnTarget: StoredOAuthState['returnTarget']
    expiresAt: string
  }): Promise<void>
  consumeOAuthState(stateHash: string, consumedAt: string): Promise<StoredOAuthState | null>
  getOAuthStateStatus(stateHash: string): Promise<OAuthStateStatus | null>
  getConnection(userId: string): Promise<GmailConnection | null>
  saveConnection(input: GmailConnection & { accountEmailHmac: string }): Promise<void>
  updateConnectionUse(userId: string, refreshToken?: GmailConnection['refreshToken']): Promise<void>
  markReauthRequired(userId: string): Promise<void>
  committedMessageHashes(userId: string, connectionId: string, hashes: string[]): Promise<Set<string>>
  stageReceipt(userId: string, connectionId: string, messageHash: string): Promise<{ id: string; status: 'staged' | 'committed' }>
  confirmReceipt(userId: string, receiptId: string, importSessionId: string, committedAt: string): Promise<boolean>
  deleteConnection(userId: string): Promise<void>
}

export type GoogleMessageMetadata = {
  id: string
  from: string
  subject: string
  receivedAt: string
  sizeEstimate: number
}

export type GoogleRawMessage = { id: string; raw: string; sizeEstimate: number }

export interface GoogleGmailGateway {
  authorizationUrl(input: { state: string; pkceChallenge: string }): string
  exchangeCode(input: { code: string; pkceVerifier: string }): Promise<{ accessToken: string; refreshToken: string; scopes: string[] }>
  refreshAccessToken(refreshToken: string): Promise<string>
  getProfile(accessToken: string): Promise<{ emailAddress: string }>
  listMessages(accessToken: string, request: GmailSearchRequest): Promise<{ ids: string[]; nextPageToken?: string }>
  getMetadata(accessToken: string, messageId: string): Promise<GoogleMessageMetadata>
  getRaw(accessToken: string, messageId: string): Promise<GoogleRawMessage>
  revoke(refreshToken: string): Promise<void>
}

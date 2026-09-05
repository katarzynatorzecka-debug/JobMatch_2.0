import { GMAIL_DEFAULT_LOOKBACK_DAYS, GMAIL_MAX_RESULTS, GmailImportError, type GmailSearchFilters, type GmailSearchRequest } from './gmailContracts'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function safeTerm(value: string | undefined) {
  if (!value) return null
  const normalized = value.trim().replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length > 200) throw new GmailImportError('GMAIL_QUERY_INVALID')
  return `"${normalized}"`
}

function gmailDate(value: string | undefined) {
  if (!value) return null
  if (!datePattern.test(value)) throw new GmailImportError('GMAIL_QUERY_INVALID')
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new GmailImportError('GMAIL_QUERY_INVALID')
  return value.replaceAll('-', '/')
}

export function buildGmailSearchRequest(filters: GmailSearchFilters = {}): GmailSearchRequest {
  const sender = safeTerm(filters.sender)
  const subject = safeTerm(filters.subject)
  const after = gmailDate(filters.after)
  const before = gmailDate(filters.before)
  if (filters.after && filters.before && filters.after >= filters.before) throw new GmailImportError('GMAIL_DATE_RANGE_INVALID')

  const parts = [sender ? `from:${sender}` : null, subject ? `subject:${subject}` : null]
  if (after) parts.push(`after:${after}`)
  if (before) parts.push(`before:${before}`)
  if (!after && !before) parts.push(`newer_than:${GMAIL_DEFAULT_LOOKBACK_DAYS}d`)

  return {
    query: parts.filter((value): value is string => Boolean(value)).join(' '),
    maxResults: GMAIL_MAX_RESULTS,
    ...(filters.pageToken?.trim() ? { pageToken: filters.pageToken.trim() } : {}),
  }
}

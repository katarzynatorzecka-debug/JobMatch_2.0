import { GMAIL_DEFAULT_LOOKBACK_DAYS, GMAIL_MAX_RESULTS, type GmailSearchFilters, type GmailSearchRequest } from './contracts.ts'
import { GmailEdgeError } from './errors.ts'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function safeTerm(value: string | undefined) {
  if (!value) return null
  const normalized = value.trim().replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length > 200) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
  return `"${normalized}"`
}

function gmailDate(value: string | undefined) {
  if (!value) return null
  if (!datePattern.test(value)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
  return value.replaceAll('-', '/')
}

export function buildGmailQuery(filters: GmailSearchFilters = {}): GmailSearchRequest {
  const sender = safeTerm(filters.sender)
  const subject = safeTerm(filters.subject)
  const after = gmailDate(filters.after)
  const before = gmailDate(filters.before)
  if (filters.after && filters.before && filters.after >= filters.before) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
  const parts = [sender ? `from:${sender}` : null, subject ? `subject:${subject}` : null]
  if (after) parts.push(`after:${after}`)
  if (before) parts.push(`before:${before}`)
  if (!after && !before) parts.push(`newer_than:${GMAIL_DEFAULT_LOOKBACK_DAYS}d`)
  return { query: parts.filter((part): part is string => Boolean(part)).join(' '), maxResults: GMAIL_MAX_RESULTS, ...(filters.pageToken?.trim() ? { pageToken: filters.pageToken.trim() } : {}) }
}

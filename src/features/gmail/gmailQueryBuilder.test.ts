import { describe, expect, it } from 'vitest'
import { GmailImportError } from './gmailContracts'
import { buildGmailSearchRequest } from './gmailQueryBuilder'

describe('Gmail query builder', () => {
  it('uses the approved defaults and sanitizes quoted filter values', () => {
    expect(buildGmailSearchRequest({ sender: ' alerts@rocketjobs.pl ', subject: 'Job "Alert"' })).toEqual({
      query: 'from:"alerts@rocketjobs.pl" subject:"Job Alert" newer_than:30d',
      maxResults: 25,
    })
  })

  it('supports explicit date bounds and a page token', () => {
    expect(buildGmailSearchRequest({ after: '2026-08-01', before: '2026-09-01', pageToken: ' next-page ' })).toEqual({
      query: 'after:2026/08/01 before:2026/09/01',
      maxResults: 25,
      pageToken: 'next-page',
    })
  })

  it('rejects malformed and reversed date ranges', () => {
    expect(() => buildGmailSearchRequest({ after: '01-08-2026' })).toThrowError(GmailImportError)
    expect(() => buildGmailSearchRequest({ after: '2026-02-31' })).toThrowError('GMAIL_QUERY_INVALID')
    expect(() => buildGmailSearchRequest({ after: '2026-09-01', before: '2026-08-01' })).toThrowError('GMAIL_DATE_RANGE_INVALID')
  })
})

import { describe, expect, it } from 'vitest'
import { buildGmailQuery } from './query'

describe('server-side Gmail query contract', () => {
  it('keeps filters and pagination while enforcing the 25-result limit', () => {
    expect(buildGmailQuery({ sender: 'no-reply@rocketjobs.pl', subject: 'Daily report', after: '2026-08-01', before: '2026-09-01', pageToken: ' next ' })).toEqual({
      query: 'from:"no-reply@rocketjobs.pl" subject:"Daily report" after:2026/08/01 before:2026/09/01',
      maxResults: 25,
      pageToken: 'next',
    })
  })

  it('uses the approved 30-day default and rejects malformed ranges', () => {
    expect(buildGmailQuery({ sender: 'no-reply@rocketjobs.pl' })).toEqual({ query: 'from:"no-reply@rocketjobs.pl" newer_than:30d', maxResults: 25 })
    expect(() => buildGmailQuery({ after: '2026-09-01', before: '2026-08-01' })).toThrow('GMAIL_MESSAGE_INVALID')
  })
})

import { describe, expect, it } from 'vitest'
import { OfferContentFetcher, isRocketJobsUrl } from './offerContentFetcher'

const base = { id: 'offer-1', title: 'Data Analyst', company: 'Example', missingFields: [], warnings: [] }
describe('OfferContentFetcher allowlist', () => {
  it('accepts only HTTPS RocketJobs URLs', () => {
    expect(isRocketJobsUrl('https://rocketjobs.pl/oferta-pracy/example')).toBe(true)
    expect(isRocketJobsUrl('https://www.rocketjobs.pl/oferta-pracy/example')).toBe(true)
    expect(isRocketJobsUrl('https://evil.example/rocketjobs.pl')).toBe(false)
    expect(isRocketJobsUrl('http://rocketjobs.pl/oferta-pracy/example')).toBe(false)
  })

  it('returns a controlled result for missing URL without a network request', async () => {
    await expect(new OfferContentFetcher().fetch(base)).resolves.toMatchObject({ status: 'unavailable', errorCode: 'SOURCE_URL_MISSING' })
  })

  it('returns a controlled result for an unsupported domain without a network request', async () => {
    await expect(new OfferContentFetcher().fetch({ ...base, sourceUrl: 'https://example.com/offer' })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'UNSUPPORTED_SOURCE_DOMAIN' })
  })
})

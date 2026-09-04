import { describe, expect, it } from 'vitest'
import { normalizeRocketJobsSourceUrl } from './rocketJobsSourceUrl'

describe('RocketJobs source URL normalization', () => {
  it('repairs legacy report paths and duplicate query separators', () => {
    expect(normalizeRocketJobsSourceUrl('https://rocketjobs.pl/oferta/example?utm_campaign=no-category?utm_source=mail')).toBe('https://rocketjobs.pl/oferta-pracy/example?utm_campaign=no-category&utm_source=mail')
  })

  it('uses the imported location to repair a stale legacy city segment', () => {
    expect(normalizeRocketJobsSourceUrl('https://rocketjobs.pl/oferta/internet-plus-seo-kielce-marketing-marketing', 'Poznań')).toBe('https://rocketjobs.pl/oferta-pracy/internet-plus-seo-poznan-marketing-marketing')
  })

  it('preserves the supported direct-link shape', () => {
    const url = 'https://rocketjobs.pl/oferta-pracy/example?utm_source=mail&utm_medium=jobalert'
    expect(normalizeRocketJobsSourceUrl(url)).toBe(url)
  })
})

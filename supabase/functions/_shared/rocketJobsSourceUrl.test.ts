import { describe, expect, it } from 'vitest'
import { normalizeRocketJobsSourceUrl } from './rocketJobsSourceUrl'

describe('RocketJobs source URL normalization', () => {
  it('repairs legacy report paths and duplicate query separators', () => {
    expect(normalizeRocketJobsSourceUrl('https://rocketjobs.pl/oferta/example?utm_campaign=no-category?utm_source=mail')).toBe('https://rocketjobs.pl/oferta-pracy/example?utm_campaign=no-category&utm_source=mail')
  })

  it('preserves the original offer location when repairing a legacy path', () => {
    expect(normalizeRocketJobsSourceUrl('https://rocketjobs.pl/oferta/internet-plus-seo-kielce-marketing-marketing')).toBe('https://rocketjobs.pl/oferta-pracy/internet-plus-seo-kielce-marketing-marketing')
  })

  it('preserves the supported direct-link shape', () => {
    const url = 'https://rocketjobs.pl/oferta-pracy/example?utm_source=mail&utm_medium=jobalert'
    expect(normalizeRocketJobsSourceUrl(url)).toBe(url)
  })
})

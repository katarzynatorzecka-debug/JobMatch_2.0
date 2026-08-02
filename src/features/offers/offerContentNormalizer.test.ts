import { describe, expect, it } from 'vitest'
import { normalizeOfferPage } from './offerContentNormalizer'

const sourceUrl = 'https://rocketjobs.pl/oferta-pracy/example'
const page = `<!doctype html><html><head><title>Automation Specialist | RocketJobs</title><style>.hide{display:none}</style><script>window.tracker = true</script></head><body><nav>Start Oferty</nav><div class="cookie-banner">Akceptuj cookies</div><main><h1>Automation Specialist</h1><p>Budujemy automatyzacje procesów dla zespołów operacyjnych i produktowych. Współpraca obejmuje projektowanie integracji, analizę procesów oraz wdrażanie rozwiązań dla klientów.</p><h2>Wymagania</h2><ul><li>Znajomość JavaScript i API</li><li>Doświadczenie z automatyzacjami</li></ul><h2>Zakres obowiązków</h2><ul><li>Projektowanie integracji</li><li>Rozwój procesów</li></ul><h2>Benefity</h2><ul><li>Praca zdalna</li></ul></main><footer>Tracking footer</footer></body></html>`

describe('normalizeOfferPage', () => {
  it('keeps normalized offer content and removes scripts, navigation and cookie text', () => {
    const result = normalizeOfferPage('offer-1', sourceUrl, page)
    expect(result.sourceQuality).toBe('full')
    expect(result.description).toContain('Automation Specialist')
    expect(result.description).not.toContain('tracker')
    expect(result.description).not.toContain('Akceptuj cookies')
    expect(result.requirements.join(' ')).toContain('JavaScript')
    expect(result.responsibilities.join(' ')).toContain('Projektowanie integracji')
  })

  it('returns an unavailable result for an empty document', () => {
    expect(normalizeOfferPage('offer-1', sourceUrl, '<main><script>1</script></main>')).toMatchObject({ status: 'unavailable', sourceQuality: 'unavailable', errorCode: 'SOURCE_EMPTY' })
  })

  it('marks short source material as partial without inventing missing fields', () => {
    const result = normalizeOfferPage('offer-1', sourceUrl, '<main><p>Krótki opis roli.</p></main>')
    expect(result.sourceQuality).toBe('partial')
    expect(result.requirements).toEqual([])
    expect(result.missingInformation).toContain('wymagania')
  })
})

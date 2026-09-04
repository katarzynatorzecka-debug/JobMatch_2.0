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

  it('recognizes current RocketJobs English sections and stops at the next heading', () => {
    const modern = `<main><h1>Systems Specialist</h1><p>Operational technology role in an international team with a sufficiently detailed public description.</p><h2>What you will do:</h2><ul><li>Build automated workflows</li><li>Maintain leadership dashboards</li></ul><h2>We look forward to working together if:</h2><ul><li>You have 3-5 years of experience in IT operations</li><li>You are fluent in English</li></ul><h2>Even better if:</h2><ul><li>You have experience with agentic AI</li></ul><h2>What we offer:</h2><ul><li>Private healthcare</li></ul><h2>About us:</h2><p>Company description must not leak into benefits.</p></main>`
    const result = normalizeOfferPage('offer-2', sourceUrl, modern)
    expect(result.sourceQuality).toBe('full')
    expect(result.responsibilities).toEqual(['Build automated workflows', 'Maintain leadership dashboards'])
    expect(result.requirements).toEqual(['You have 3-5 years of experience in IT operations', 'You are fluent in English', 'Mile widziane: You have experience with agentic AI'])
    expect(result.benefits).toEqual(['Private healthcare'])
    expect(result.benefits.join(' ')).not.toContain('Company description')
  })

  it('recognizes RocketJobs nested skill headings and strong section labels', () => {
    const rocketJobs = `<main><h1>Community Moderator - Social Media Moderator</h1><h3>Opis stanowiska</h3><p>We are looking for a community moderator for an international marketing communication team with a detailed public role description.</p><p><strong>Language: Arabic (native)</strong></p><p><strong>You will:</strong></p><ul><li>Work with social media</li><li>Initiate discussions in social media</li></ul><p><strong>We need you:</strong></p><ul><li>To be a social media freak</li><li>To have a knack for the written word</li></ul><p><strong>We offer:</strong></p><ul><li>Flexible timelines</li></ul><h3>Wymagane umiejętności</h3><h4>arabski</h4><h4>social media</h4><h3>Lokalizacja biura</h3></main>`
    const result = normalizeOfferPage('offer-rocketjobs', sourceUrl, rocketJobs)
    expect(result.sourceQuality).toBe('full')
    expect(result.requirements).toEqual(['To be a social media freak', 'To have a knack for the written word', 'arabski', 'social media', 'Language: Arabic (native)'])
    expect(result.responsibilities).toEqual(['Work with social media', 'Initiate discussions in social media'])
    expect(result.benefits).toEqual(['Flexible timelines'])
  })

  it('uses explicit statements from text when the page has no recognized section headings', () => {
    const result = normalizeOfferPage('offer-3', sourceUrl, '<main><p>Detailed role description for a distributed team. You have at least 4 years of experience in service delivery. You are fluent in English.</p></main>')
    expect(result.requirements).toEqual(['You have at least 4 years of experience in service delivery.', 'You are fluent in English.'])
    expect(result.responsibilities).toEqual([])
    expect(result.sourceQuality).toBe('partial')
  })

  it('treats visual text headings as section boundaries instead of mixing benefits into responsibilities', () => {
    const visual = `<main><h1>Marketing Manager</h1><p>⭐ About Example</p><p>Company description.</p><p>⭐ What You'll Do</p><p>Build acquisition campaigns</p><p>Measure incrementality</p><p>⭐ What We're Looking For</p><p>Must-haves</p><p>5 years of performance marketing experience</p><p>Nice-to-haves</p><p>Experience with LinkedIn Ads</p><p>⭐ What Makes Us a Great Place to Work</p><p>Private healthcare</p><h2>About us</h2><p>Footer copy.</p></main>`
    const result = normalizeOfferPage('offer-4', sourceUrl, visual)
    expect(result.responsibilities).toEqual(['Build acquisition campaigns', 'Measure incrementality'])
    expect(result.requirements).toEqual(['5 years of performance marketing experience', 'Mile widziane: Experience with LinkedIn Ads'])
    expect(result.benefits).toEqual(['Private healthcare'])
  })
})

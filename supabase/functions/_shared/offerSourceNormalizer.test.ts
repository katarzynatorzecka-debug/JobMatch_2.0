import { describe, expect, it } from 'vitest'
import { hasRunnableOfferSourceContent, normalizeOfferPage } from './offerSourceNormalizer'

describe('offer source metadata normalization', () => {
  it('recovers hard-filter metadata from JobPosting structured data when the import seed is empty', () => {
    const html = `<html><head><title>AI Prototype Builder</title><script type="application/ld+json">{"@type":"JobPosting","jobLocation":{"address":{"addressLocality":"Warszawa"}},"employmentType":"FULL_TIME"}</script></head><body><main><h1>AI Prototype Builder</h1><h2>Wymagania</h2><p>Doświadczenie w prototypowaniu.</p><h2>Obowiązki</h2><p>Budowanie prototypów.</p><p>Tryb pracy: hybrydowo</p></main></body></html>`
    const result = normalizeOfferPage('offer-1', 'https://rocketjobs.pl/oferta-pracy/example', html, { title: 'Oferta z linku', company: 'rocketjobs.pl' })
    expect(result.location).toBe('Warszawa')
    expect(result.contractType).toBe('Pełny etat')
    expect(result.workMode).toBe('hybrydowo')
  })

  it('prefers an explicit legal contract label over generic JSON-LD employment time', () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"JobPosting","employmentType":"FULL_TIME"}</script></head><body><main><h1>Role</h1><h2>Wymagania</h2><p>Doświadczenie w pracy.</p><h2>Obowiązki</h2><p>Realizacja zadań.</p><p>Rodzaj umowy: Umowa o pracę</p><p>Tryb pracy: hybrydowo</p></main></body></html>`
    const result = normalizeOfferPage('offer-2', 'https://rocketjobs.pl/oferta-pracy/example-2', html)
    expect(result.contractType).toBe('Umowa o pracę')
    expect(result.workMode).toBe('hybrydowo')
  })

  it('does not infer a contract from a generic employment mention in the description', () => {
    const html = `<html><body><main><h1>Role</h1><h2>Wymagania</h2><p>Experience in employment platforms.</p><h2>Obowiązki</h2><p>Realizacja zadań.</p></main></body></html>`
    const result = normalizeOfferPage('offer-3', 'https://rocketjobs.pl/oferta-pracy/example-3', html)
    expect(result.contractType).toBeUndefined()
  })

  it('accepts a sufficiently grounded source when RocketJobs headings are missing', () => {
    const text = 'AI Prototype Builder. ' + 'Opis stanowiska i zakres pracy. '.repeat(8) + 'Wymagamy praktycznego doświadczenia w budowaniu aplikacji webowych.'
    expect(hasRunnableOfferSourceContent({ text, requirements: [], responsibilities: [] })).toBe(true)
  })

  it('still blocks an empty or purely generic source', () => {
    expect(hasRunnableOfferSourceContent({ text: 'Krótki opis stanowiska.', requirements: [], responsibilities: [] })).toBe(false)
    expect(hasRunnableOfferSourceContent({ text: 'Opis stanowiska. ' + 'Praca w zespole. '.repeat(20), requirements: [], responsibilities: [] })).toBe(false)
  })
})

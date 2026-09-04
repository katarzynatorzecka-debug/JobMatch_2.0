import { describe, expect, it } from 'vitest'
import { normalizeOfferPage } from './offerSourceNormalizer'

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
})

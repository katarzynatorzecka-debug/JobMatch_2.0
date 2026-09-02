import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalysisCardHeader } from './OfferDetailsPage'

describe('OfferDetails analysis score placement', () => {
  it('renders one score badge inside the analysis card header', () => {
    const markup = renderToStaticMarkup(<AnalysisCardHeader analysis={{ overallScore: 30, recommendation: 'Wymaga sprawdzenia' }} />)
    expect(markup).toContain('analysis-card-heading')
    expect(markup).toContain('30')
    expect((markup.match(/score-badge/g) ?? []).length).toBe(1)
    expect(markup).toContain('Wymaga sprawdzenia')
  })

  it('marks a limited result as partial instead of duplicating its summary', () => {
    const markup = renderToStaticMarkup(<AnalysisCardHeader analysis={{ overallScore: 100, recommendation: 'Wymaga sprawdzenia', scoring: { algorithmVersion: 'r8', weights: { experience: 35, skills: 30, preferences: 20, growth: 15 }, coverage: 35, criterionConfidence: 80, reliability: 'limited', scoredCategories: ['preferences'] } }} />)
    expect(markup).toContain('wynik częściowy')
    expect(markup).not.toContain('Podsumowanie analizy')
  })
})

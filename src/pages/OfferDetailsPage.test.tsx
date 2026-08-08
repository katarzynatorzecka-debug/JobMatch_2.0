import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalysisCardHeader } from './OfferDetailsPage'

describe('OfferDetails analysis score placement', () => {
  it('renders one score badge inside the analysis card header', () => {
    const markup = renderToStaticMarkup(<AnalysisCardHeader analysis={{ overallScore: 30, recommendation: 'Wymaga sprawdzenia', summary: 'Podsumowanie analizy.' }} />)
    expect(markup).toContain('analysis-card-heading')
    expect(markup).toContain('30')
    expect((markup.match(/score-badge/g) ?? []).length).toBe(1)
    expect(markup).toContain('Wymaga sprawdzenia')
  })
})
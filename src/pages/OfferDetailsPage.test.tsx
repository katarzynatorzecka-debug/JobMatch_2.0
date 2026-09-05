import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalysisCardHeader } from './OfferDetailsPage'
import { I18nProvider } from '../i18n/I18nProvider'

const renderHeader = (analysis: Parameters<typeof AnalysisCardHeader>[0]['analysis'], locale: 'pl' | 'en' = 'pl') => renderToStaticMarkup(<I18nProvider initialLocale={locale}><AnalysisCardHeader analysis={analysis} /></I18nProvider>)

describe('OfferDetails analysis score placement', () => {
  it('renders one score badge inside the analysis card header', () => {
    const markup = renderHeader({ overallScore: 30, recommendation: 'Wymaga sprawdzenia' })
    expect(markup).toContain('analysis-card-heading')
    expect(markup).toContain('30')
    expect((markup.match(/score-badge/g) ?? []).length).toBe(1)
    expect(markup).toContain('Wymaga sprawdzenia')
  })

  it('marks a limited result as partial instead of duplicating its summary', () => {
    const markup = renderHeader({ overallScore: 100, recommendation: 'Wymaga sprawdzenia', scoring: { algorithmVersion: 'r8', weights: { experience: 35, skills: 30, preferences: 20, growth: 15 }, coverage: 35, criterionConfidence: 80, reliability: 'limited', scoredCategories: ['preferences'] } })
    expect(markup).toContain('wynik częściowy')
    expect(markup).not.toContain('Podsumowanie analizy')
  })

  it('uses an English score label without translating the stored recommendation', () => {
    const markup = renderHeader({ overallScore: 30, recommendation: 'Wymaga sprawdzenia' }, 'en')
    expect(markup).toContain('Match score: 30 out of 100')
    expect(markup).toContain('Wymaga sprawdzenia')
  })
})

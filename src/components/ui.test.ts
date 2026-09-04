import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import { AnalysisQuality, HardFilterReason, ScoreBadge, analysisNarrativeData, formatPercentage } from './ui'

const analysis: JobAnalysis = {
  offerId: 'offer-1',
  overallScore: 78,
  categoryScores: {
    experience: { score: 80, rationale: 'Potwierdzone.' },
    skills: { score: 75, rationale: 'Częściowo potwierdzone.' },
    preferences: { score: 70, rationale: 'Zgodne.' },
    growth: { score: null, rationale: 'Brak danych.' },
  },
  recommendation: 'Warto aplikować',
  summary: 'Profil odpowiada kluczowym wymaganiom oferty.',
  strengths: ['Automatyzacja procesów', 'Doświadczenie analityczne', 'Współpraca z biznesem', 'Niewidoczna czwarta pozycja'],
  risks: ['Brak potwierdzenia znajomości domeny'],
  missingInformation: ['Nie podano modelu pracy'],
  hardFilterStatus: 'weak',
  hardFilterReasons: ['Forma współpracy wymaga potwierdzenia.'],
  sourceQuality: 'full',
  modelInfo: { provider: 'openai', model: 'test', provisional: false },
  createdAt: '2026-08-06T12:00:00.000Z',
  status: 'ready',
  scoring: { algorithmVersion: 'v1', weights: { experience: 35, skills: 30, preferences: 20, growth: 15 }, coverage: 80, criterionConfidence: 75, reliability: 'standard', scoredCategories: ['experience', 'skills', 'preferences'] },
}

describe('analysisNarrativeData', () => {
  it('uses stored summary, strengths, risks and a separate Hard Filter warning', () => {
    expect(analysisNarrativeData(analysis)).toEqual({
      headline: 'Dlaczego ta oferta pasuje',
      recommendation: 'Warto aplikować',
      summary: 'Profil odpowiada kluczowym wymaganiom oferty.',
      strengths: ['Automatyzacja procesów', 'Doświadczenie analityczne', 'Współpraca z biznesem'],
      risks: ['Brak potwierdzenia znajomości domeny', 'Nie podano modelu pracy'],
      hardFilterWarning: 'Wymaga potwierdzenia: Forma współpracy wymaga potwierdzenia.',
    })
  })

  it('does not invent a narrative when an analysis is unavailable', () => {
    expect(analysisNarrativeData(null)).toBeNull()
  })

  it('deduplicates the same risk repeated with a technical prefix', () => {
    const repeated = { ...analysis, risks: ['Brak bezpośredniego doświadczenia w moderacji social media'], missingInformation: ['Ryzyko: Brak bezpośredniego doświadczenia w moderacji social media'] }
    expect(analysisNarrativeData(repeated)?.risks).toEqual(['Brak bezpośredniego doświadczenia w moderacji social media'])
  })

  it('never presents 100 at low coverage as a full high match', () => {
    const limited = { ...analysis, overallScore: 100, recommendation: 'Wymaga sprawdzenia' as const, scoring: { ...analysis.scoring!, coverage: 35, reliability: 'limited' as const } }
    const quality = renderToStaticMarkup(createElement(AnalysisQuality, { analysis: limited }))
    const badge = renderToStaticMarkup(createElement(ScoreBadge, { score: 100, limited: true }))
    expect(quality).toContain('Wynik częściowy: 100/100 przy 35% pokrycia')
    expect(quality).toContain('Nie interpretuj jako pełnego dopasowania')
    expect(quality).not.toContain('wysokie dopasowanie')
    expect(badge).toContain('wynik częściowy')
  })
})

describe('formatPercentage', () => {
  it('rounds a coverage value to a whole percentage for display', () => {
    expect(formatPercentage(63.33333)).toBe('63%')
    expect(formatPercentage(63.5)).toBe('64%')
  })
})

describe('HardFilterReason', () => {
  it('renders nothing when no conflict is present', () => {
    expect(renderToStaticMarkup(createElement(HardFilterReason, { reasons: [] }))).toBe('')
  })

  it('renders nothing when reasons do not contain a displayable conflict', () => {
    expect(renderToStaticMarkup(createElement(HardFilterReason, { reasons: [{}] }))).toBe('')
  })

  it('renders the conflict when a reason is present', () => {
    expect(renderToStaticMarkup(createElement(HardFilterReason, { reasons: [{ code: 'work-mode' }] }))).toContain('Tryb pracy nie odpowiada preferencjom profilu.')
  })
})

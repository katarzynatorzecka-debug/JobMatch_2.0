import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactElement } from 'react'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import { AnalysisQuality, HardFilterReason, HardFilterStatusBadge, ScoreBadge, analysisNarrativeData, formatPercentage } from './ui'
import { I18nProvider } from '../i18n/I18nProvider'

const renderWithI18n = (component: ReactElement, locale: 'pl' | 'en' = 'pl') => renderToStaticMarkup(createElement(I18nProvider, { initialLocale: locale, children: component }))

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
  localizedContent: {
    pl: { summary: 'Profil odpowiada kluczowym wymaganiom oferty.', strengths: ['Automatyzacja procesów', 'Doświadczenie analityczne', 'Współpraca z biznesem', 'Niewidoczna czwarta pozycja'], risks: ['Brak potwierdzenia znajomości domeny'], missingInformation: ['Nie podano modelu pracy'] },
    en: { summary: 'The profile matches the key job requirements.', strengths: ['Process automation', 'Analytical experience', 'Business collaboration', 'Hidden fourth item'], risks: ['Domain knowledge is not confirmed'], missingInformation: ['The work model was not provided'] },
  },
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
    const repeated = { ...analysis, localizedContent: undefined, risks: ['Brak bezpośredniego doświadczenia w moderacji social media'], missingInformation: ['Ryzyko: Brak bezpośredniego doświadczenia w moderacji social media'] }
    expect(analysisNarrativeData(repeated)?.risks).toEqual(['Brak bezpośredniego doświadczenia w moderacji social media'])
  })

  it('never presents 100 at low coverage as a full high match', () => {
    const limited = { ...analysis, overallScore: 100, recommendation: 'Wymaga sprawdzenia' as const, scoring: { ...analysis.scoring!, coverage: 35, reliability: 'limited' as const } }
    const quality = renderWithI18n(createElement(AnalysisQuality, { analysis: limited }))
    const badge = renderWithI18n(createElement(ScoreBadge, { score: 100, limited: true }))
    expect(quality).toContain('Wynik częściowy: 100/100 przy 35% pokrycia')
    expect(quality).toContain('Nie interpretuj jako pełnego dopasowania')
    expect(quality).not.toContain('wysokie dopasowanie')
    expect(badge).toContain('wynik częściowy')
  })

  it('switches generated narrative together with the interface without changing the score', () => {
    const quality = renderWithI18n(createElement(AnalysisQuality, { analysis }), 'en')
    expect(quality).toContain('Coverage: 80%')
    expect(quality).toContain('Candidate strengths')
    expect(quality).toContain('The profile matches the key job requirements.')
    expect(quality).toContain('Process automation')
    expect(quality).not.toContain('Preparing the English analysis')
    expect(quality).not.toContain('Profil odpowiada kluczowym wymaganiom oferty.')
    expect(quality).toContain('78/100')
  })

  it('never flashes Polish narrative while an English historical analysis is being localized', () => {
    const legacy = { ...analysis, localizedContent: undefined }
    const quality = renderWithI18n(createElement(AnalysisQuality, { analysis: legacy, analysisVersionId: 'analysis-version-1' }), 'en')
    expect(quality).toContain('Preparing the English analysis')
    expect(quality).not.toContain('Profil odpowiada kluczowym wymaganiom oferty.')
    expect(quality).toContain('78/100')
  })

  it('does not expose Polish narrative for a non-versioned historical analysis in English', () => {
    const legacy = { ...analysis, localizedContent: undefined }
    const quality = renderWithI18n(createElement(AnalysisQuality, { analysis: legacy }), 'en')
    expect(quality).toContain('does not have an English version')
    expect(quality).not.toContain('Profil odpowiada kluczowym wymaganiom oferty.')
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
    expect(renderWithI18n(createElement(HardFilterReason, { reasons: [] }))).toBe('')
  })

  it('renders nothing when reasons do not contain a displayable conflict', () => {
    expect(renderWithI18n(createElement(HardFilterReason, { reasons: [{}] }))).toBe('')
  })

  it('renders the conflict when a reason is present', () => {
    expect(renderWithI18n(createElement(HardFilterReason, { reasons: [{ code: 'work-mode' }] }))).toContain('Tryb pracy nie odpowiada preferencjom profilu.')
  })
})

describe('HardFilterStatusBadge', () => {
  it('localizes every Hard Filter status in Polish and English', () => {
    expect(['pass', 'weak', 'fail'].map((status) => renderWithI18n(createElement(HardFilterStatusBadge, { status: status as 'pass' | 'weak' | 'fail' })))).toEqual(expect.arrayContaining([
      expect.stringContaining('Przechodzi'),
      expect.stringContaining('Wymaga sprawdzenia'),
      expect.stringContaining('Odrzucona'),
    ]))
    expect(['pass', 'weak', 'fail'].map((status) => renderWithI18n(createElement(HardFilterStatusBadge, { status: status as 'pass' | 'weak' | 'fail' }), 'en'))).toEqual(expect.arrayContaining([
      expect.stringContaining('Passes'),
      expect.stringContaining('Needs review'),
      expect.stringContaining('Rejected'),
    ]))
  })
})

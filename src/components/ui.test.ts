import { describe, expect, it } from 'vitest'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import { analysisNarrativeData, formatPercentage } from './ui'

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
})

describe('formatPercentage', () => {
  it('rounds a coverage value to a whole percentage for display', () => {
    expect(formatPercentage(63.33333)).toBe('63%')
    expect(formatPercentage(63.5)).toBe('64%')
  })
})

import { describe, expect, it } from 'vitest'
import type { JobAnalysis } from '../../contracts/jobAnalysis'
import { analysisNarrativeForLocale, criterionRationaleForLocale } from './analysisLocalization'

const base = { summary: 'Polskie podsumowanie.', strengths: ['Mocna strona.'], risks: ['Ryzyko.'], missingInformation: ['Brak.'] }
const analysis = { ...base, localizedContent: { pl: base, en: { summary: 'English summary.', strengths: ['Strength.'], risks: ['Risk.'], missingInformation: ['Missing.'] } } } as JobAnalysis

describe('analysis localization', () => {
  it('selects the requested generated language without touching scoring data', () => {
    expect(analysisNarrativeForLocale(analysis, 'en')).toEqual(analysis.localizedContent?.en)
    expect(analysisNarrativeForLocale(analysis, 'pl')).toEqual(analysis.localizedContent?.pl)
  })

  it('falls back to historical content when bilingual fields are absent', () => {
    expect(analysisNarrativeForLocale({ ...analysis, localizedContent: undefined }, 'en')).toEqual(base)
  })

  it('localizes criterion rationale but preserves its source requirement and evidence separately', () => {
    const criterion = { rationale: 'Uzasadnienie.', localizedRationale: { pl: 'Uzasadnienie.', en: 'Rationale.' } } as never
    expect(criterionRationaleForLocale(criterion, 'en')).toBe('Rationale.')
  })
})

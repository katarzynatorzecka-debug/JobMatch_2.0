import { describe, expect, it } from 'vitest'
import { translate } from './I18nProvider'
import { enTranslations } from './translations/en'
import { plTranslations } from './translations/pl'
import { translationParameterNames } from './translationTypes'

describe('translation dictionaries', () => {
  it('has exactly the same keys in Polish and English', () => {
    expect(Object.keys(enTranslations).sort()).toEqual(Object.keys(plTranslations).sort())
  })

  it('uses the same interpolation parameters for every locale', () => {
    for (const key of Object.keys(plTranslations) as Array<keyof typeof plTranslations>) {
      expect(translationParameterNames(enTranslations[key]), key)
        .toEqual(translationParameterNames(plTranslations[key]))
    }
  })

  it('interpolates typed score, percentage and date parameters', () => {
    expect(translate('pl', 'common.scoreOutOf100', { score: 79 })).toBe('Wynik: 79/100')
    expect(translate('en', 'common.percentage', { percentage: 63 })).toBe('63%')
    expect(translate('en', 'common.dateValue', { date: '5 September 2026' }))
      .toBe('Date: 5 September 2026')
  })
})

import { describe, expect, it } from 'vitest'
import { translate } from './I18nProvider'
import { enTranslations } from './translations/en'
import { plTranslations } from './translations/pl'
import { translationParameterNames } from './translationTypes'

describe('translation dictionaries', () => {
  it('has exactly the same keys in Polish and English', () => {
    expect(Object.keys(enTranslations).sort()).toEqual(Object.keys(plTranslations).sort())
  })

  it('contains a visible translation for every key in both locales', () => {
    for (const [key, value] of Object.entries(plTranslations)) {
      expect(value.trim(), `Missing Polish translation for ${key}`).not.toBe('')
      expect(value, `Polish UI would expose translation key ${key}`).not.toBe(key)
    }
    for (const [key, value] of Object.entries(enTranslations)) {
      expect(value.trim(), `Missing English translation for ${key}`).not.toBe('')
      expect(value, `English UI would expose translation key ${key}`).not.toBe(key)
    }
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

  it('covers import sources, pipeline states and errors in Polish and English', () => {
    const keys = [
      'import.drop.title',
      'import.url.label',
      'import.status.waiting',
      'import.status.hardFiltering',
      'import.status.queued',
      'import.status.processing',
      'import.status.completed',
      'import.status.rejected',
      'import.status.failed',
      'import.error.readReport',
      'import.error.noOffers',
      'import.error.invalidUrl',
      'import.error.unsupportedUrl',
      'import.error.urlRead',
      'import.error.restoreOffer',
      'import.error.profileRequired',
      'import.error.profileSaveRequired',
      'import.error.start',
    ] as const

    for (const key of keys) {
      expect(translate('pl', key)).not.toBe(translate('en', key))
      expect(translate('pl', key)).not.toBe(key)
      expect(translate('en', key)).not.toBe(key)
    }
  })
})

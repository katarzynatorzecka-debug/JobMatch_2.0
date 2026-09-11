import { describe, expect, it } from 'vitest'
import { importFileErrorLabel, importWarningLabel, presentOfferIssues } from './offerIssuePresentation'

describe('offer issue presentation', () => {
  it('shows one fact when missing fields and parser warnings describe the same absence', () => {
    expect(presentOfferIssues({ missingFields: ['wynagrodzenie'], warnings: ['Brak danych: wynagrodzenie.'] })).toEqual({ missing: ['wynagrodzenie'], warnings: [] })
  })

  it('keeps distinct warnings once and removes repeated prefixes', () => {
    expect(presentOfferIssues({ missingFields: ['wynagrodzenie'], warnings: ['Brak danych: lokalizacja.', 'Brak danych: lokalizacja.'] })).toEqual({ missing: ['wynagrodzenie'], warnings: ['lokalizacja'] })
  })
  it('localizes known historical issue fields in English', () => {
    expect(presentOfferIssues({ missingFields: ['wynagrodzenie'], warnings: ['Brak danych: lokalizacja.'] }, 'en')).toEqual({ missing: ['salary'], warnings: ['location'] })
  })

  it('localizes structured EML import warnings while preserving the offer identity', () => {
    const duplicate = { code: 'duplicate' as const, message: 'Pominięto zduplikowaną ofertę: Data Analyst.' }
    expect(importWarningLabel(duplicate, 'pl')).toBe('Pominięto zduplikowaną ofertę: Data Analyst.')
    expect(importWarningLabel(duplicate, 'en')).toBe('Skipped duplicate offer: Data Analyst.')
    expect(importWarningLabel({ code: 'unsupported-layout', message: 'legacy parser text' }, 'en')).toContain('RocketJobs links were found')
  })

  it('localizes every known file validation and extraction error', () => {
    expect([
      'Wybierz plik raportu.',
      'Wybierz plik w formacie .eml.',
      'Ten typ pliku nie wygląda jak wiadomość EML.',
      'Wybrany plik jest pusty.',
      'Plik jest zbyt duży. Maksymalny rozmiar to 10 MB.',
      'Nie znaleziono treści raportu w pliku EML.',
      'Nie udało się odczytać tego pliku EML.',
    ].map((message) => importFileErrorLabel(message, 'en'))).toEqual([
      'Choose a report file.',
      'Choose a file in .eml format.',
      'This file type does not look like an EML message.',
      'The selected file is empty.',
      'The file is too large. The maximum size is 10 MB.',
      'No report content was found in the EML file.',
      'This EML file could not be read.',
    ])
  })
})

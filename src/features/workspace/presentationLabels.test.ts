import { describe, expect, it } from 'vitest'
import { analysisDateLabel, analysisStateLabel, criterionOutcomeLabel, hardFilterReasonLabels, sourceQualityLabel } from './presentationLabels'

describe('presentation labels', () => {
  it('maps a structured Hard Filter reason to its product label', () => {
    expect(hardFilterReasonLabels([{ code: 'work-mode', label: 'Praca zdalna nie jest dostepna.' }])).toEqual(['Tryb pracy nie odpowiada preferencjom profilu.'])
  })

  it('does not expose raw Hard Filter codes', () => {
    const label = hardFilterReasonLabels([{ code: 'work-mode' }])[0]
    expect(label).toBe('Tryb pracy nie odpowiada preferencjom profilu.')
    expect(label).not.toContain('work-mode')
  })


  it('maps all criterion outcomes to product labels', () => {
    expect(['MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN'].map((value) => criterionOutcomeLabel(value))).toEqual([
      'Spełnione',
      'Częściowo spełnione',
      'Niepotwierdzone w profilu',
      'Brak wystarczających danych',
    ])
  })
  it('localizes domain labels without exposing legacy Polish labels in English', () => {
    expect(hardFilterReasonLabels([{ code: 'work-mode', label: 'Praca zdalna nie jest dostepna.' }], 'en')).toEqual(['The work mode does not match the profile preferences.'])
    expect(criterionOutcomeLabel('MATCH', 'en')).toBe('Met')
    expect(sourceQualityLabel('full', 'en')).toBe('Full offer data')
    expect(analysisStateLabel({ queueStatus: 'queued', errorCode: null, freshness: 'missing' }, 'en')).toBe('Waiting for analysis')
    expect(analysisDateLabel(null, 'en')).toBe('Analysis date unavailable')
    expect(hardFilterReasonLabels(['Brak informacji o trybie pracy.'], 'en')).toEqual(['Data required for full verification is missing.'])
  })
  it('uses the same source-quality vocabulary for all views', () => {
    expect(sourceQualityLabel('full')).toBe('Pełne dane oferty')
    expect(sourceQualityLabel('partial')).toBe('Częściowe dane oferty')
  })

  it('maps queue and freshness states to product language', () => {
    expect(analysisStateLabel({ queueStatus: 'queued', errorCode: null, freshness: 'missing' })).toBe('Oczekuje na analizę')
    expect(analysisStateLabel({ queueStatus: 'processing', errorCode: null, freshness: 'missing' })).toBe('Analiza w toku')
    expect(analysisStateLabel({ queueStatus: null, errorCode: 'PROVIDER_TIMEOUT', freshness: 'current' })).toBe('Analiza nie powiodła się. Spróbuj ponownie.')
    expect(analysisStateLabel({ queueStatus: null, errorCode: null, freshness: 'stale_profile' })).toBe('Wynik wymaga ponownej analizy')
  })

  it('formats a useful analysis timestamp without exposing an internal identifier', () => {
    expect(analysisDateLabel('2026-08-07T12:00:00.000Z')).toContain('Analizowano:')
    expect(analysisDateLabel(null)).toBe('Data analizy niedostępna')
  })
})

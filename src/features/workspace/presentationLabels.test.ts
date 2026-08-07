import { describe, expect, it } from 'vitest'
import { analysisDateLabel, analysisStateLabel, hardFilterReasonLabels, sourceQualityLabel } from './presentationLabels'

describe('presentation labels', () => {
  it('maps a structured Hard Filter reason to its product label', () => {
    expect(hardFilterReasonLabels([{ code: 'work-mode', label: 'Praca zdalna nie jest dostepna.' }])).toEqual(['Praca zdalna nie jest dostepna.'])
  })

  it('does not expose raw Hard Filter codes', () => {
    const label = hardFilterReasonLabels([{ code: 'work-mode' }])[0]
    expect(label).toBe('Tryb pracy nie odpowiada preferencjom profilu.')
    expect(label).not.toContain('work-mode')
  })

  it('uses the same source-quality vocabulary for all views', () => {
    expect(sourceQualityLabel('full')).toBe('Pelne dane oferty')
    expect(sourceQualityLabel('partial')).toBe('Czesciowe dane oferty')
  })

  it('maps queue and freshness states to product language', () => {
    expect(analysisStateLabel({ queueStatus: 'queued', errorCode: null, freshness: 'missing' })).toBe('Oczekuje na analize')
    expect(analysisStateLabel({ queueStatus: 'processing', errorCode: null, freshness: 'missing' })).toBe('Analiza w toku')
    expect(analysisStateLabel({ queueStatus: null, errorCode: 'PROVIDER_TIMEOUT', freshness: 'current' })).toBe('Analiza nie powiodla sie. Spróbuj ponownie.')
    expect(analysisStateLabel({ queueStatus: null, errorCode: null, freshness: 'stale_profile' })).toBe('Wynik wymaga ponownej analizy')
  })

  it('formats a useful analysis timestamp without exposing an internal identifier', () => {
    expect(analysisDateLabel('2026-08-07T12:00:00.000Z')).toContain('Analizowano:')
    expect(analysisDateLabel(null)).toBe('Data analizy niedostepna')
  })
})
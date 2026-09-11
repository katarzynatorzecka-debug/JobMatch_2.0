import { describe, expect, it } from 'vitest'
import type { ImportedReport } from '../../contracts/import'
import { appendBatchEntries, createImportBatchState, hasRemovedOffers, markBatchReady, removeBatchOffer, removeBatchReport, restoreBatchOffers, summarizeBatch, visibleOffers } from './importBatchState'

function report(fileName: string, ids: string[], warning = false): ImportedReport {
  return {
    version: 2, source: 'rocketjobs-eml', reportProvider: 'rocketjobs', acquisitionChannel: 'eml', fileName, importedAt: '2026-08-06T08:00:00.000Z',
    warnings: warning ? [{ code: 'partial-parse', message: 'Część układu wymaga sprawdzenia.' }] : [],
    offers: ids.map((id, index) => ({ id, title: `Stanowisko ${id}`, company: `Firma ${index}`, sourceUrl: `https://rocketjobs.pl/oferta-pracy/${id}`, missingFields: index === 0 && warning ? ['wynagrodzenie'] : [], warnings: index === 0 && warning ? ['Brak danych: wynagrodzenie.'] : [] })),
  }
}

function entry(id: string, value: ImportedReport) { return { kind: 'report' as const, id, report: value, removedOfferIds: [] } }

describe('import batch state', () => {
  it('adds multiple reports without replacing earlier files and keeps their order', () => {
    const state = appendBatchEntries(createImportBatchState(), [entry('A', report('A.eml', ['a1'])), entry('B', report('B.eml', ['b1']))])
    const next = appendBatchEntries(state, [entry('C', report('C.eml', ['c1']))])
    expect(next.entries.map((item) => item.id)).toEqual(['A', 'B', 'C'])
    expect(next.status).toBe('review')
    expect(markBatchReady(next).status).toBe('ready_to_analyze')
  })

  it('removes one report together with only its offers', () => {
    const state = appendBatchEntries(createImportBatchState(), [entry('A', report('A.eml', ['a1'])), entry('B', report('B.eml', ['b1']))])
    expect(removeBatchReport(state, 'A').entries.map((item) => item.id)).toEqual(['B'])
  })

  it('removes one offer and restores every removed offer once in original order', () => {
    const initial = appendBatchEntries(createImportBatchState(), [entry('A', report('A.eml', ['a1', 'a2'])), entry('B', report('B.eml', ['b1']))])
    const removed = removeBatchOffer(initial, 'A', 'a1')
    expect(visibleOffers(removed.entries[0] as ReturnType<typeof entry>).map((offer) => offer.id)).toEqual(['a2'])
    expect(hasRemovedOffers(removed)).toBe(true)
    const restored = restoreBatchOffers(removed)
    expect(visibleOffers(restored.entries[0] as ReturnType<typeof entry>).map((offer) => offer.id)).toEqual(['a1', 'a2'])
    expect(hasRemovedOffers(restored)).toBe(false)
  })

  it('keeps valid reports when one file fails and exposes a partial review state', () => {
    const state = appendBatchEntries(createImportBatchState(), [entry('A', report('A.eml', ['a1'], true)), { kind: 'file_error', id: 'broken', fileName: 'broken.eml', message: 'Nie udało się odczytać raportu.' }])
    expect(state.status).toBe('partial_review')
    expect(summarizeBatch(state)).toMatchObject({ reportCount: 1, fileErrorCount: 1, warningCount: 2, missingFieldCount: 1 })
  })

  it('reports local duplicates without removing them or treating filenames as duplicates', () => {
    const first = report('same-name.eml', ['same'])
    const second = report('same-name.eml', ['same'])
    const state = appendBatchEntries(createImportBatchState(), [entry('A', first), entry('B', second)])
    expect(summarizeBatch(state)).toMatchObject({ reportCount: 2, recognizedOfferCount: 2, localDuplicateCount: 1 })
  })

  it('returns to idle after explicitly removing every report', () => {
    const state = appendBatchEntries(createImportBatchState(), [entry('A', report('A.eml', ['a1']))])
    expect(removeBatchReport(state, 'A')).toEqual(createImportBatchState())
  })
})

import type { ImportedJobOffer, ImportedReport, ImportWarning } from '../../contracts/import'

export type ImportBatchStatus =
  | 'idle'
  | 'adding_files'
  | 'reading'
  | 'parsing'
  | 'review'
  | 'partial_review'
  | 'file_error'
  | 'empty'
  | 'ready_to_analyze'

export type ImportBatchReport = {
  kind: 'report'
  id: string
  report: ImportedReport
  removedOfferIds: string[]
}

export type ImportBatchFileError = {
  kind: 'file_error'
  id: string
  fileName: string
  message: string
}

export type ImportBatchEntry = ImportBatchReport | ImportBatchFileError

export type ImportBatchState = {
  status: ImportBatchStatus
  entries: ImportBatchEntry[]
}

export type ImportBatchSummary = {
  reportCount: number
  fileErrorCount: number
  recognizedOfferCount: number
  visibleOfferCount: number
  warningCount: number
  missingFieldCount: number
  localDuplicateCount: number
}

export function createImportBatchState(): ImportBatchState {
  return { status: 'idle', entries: [] }
}

export function createImportBatchId(fileName: string, sequence: number) {
  return `${fileName}:${sequence}`
}

export function visibleOffers(entry: ImportBatchReport) {
  return entry.report.offers.filter((offer) => !entry.removedOfferIds.includes(offer.id))
}

export function reportWarnings(entry: ImportBatchReport): ImportWarning[] {
  return entry.report.warnings
}

export function hasRemovedOffers(state: ImportBatchState) {
  return state.entries.some((entry) => entry.kind === 'report' && entry.removedOfferIds.length > 0)
}

export function batchReports(state: ImportBatchState): ImportBatchReport[] {
  return state.entries.filter((entry): entry is ImportBatchReport => entry.kind === 'report')
}

function nextStatus(entries: ImportBatchEntry[]): ImportBatchStatus {
  const reports = entries.filter((entry): entry is ImportBatchReport => entry.kind === 'report')
  const errors = entries.filter((entry) => entry.kind === 'file_error')
  const offerCount = reports.reduce((total, entry) => total + visibleOffers(entry).length, 0)
  if (!entries.length) return 'idle'
  if (!reports.length) return errors.length ? 'file_error' : 'empty'
  if (!offerCount) return 'empty'
  if (errors.length) return 'partial_review'
  return 'review'
}

export function appendBatchEntries(state: ImportBatchState, entries: ImportBatchEntry[]): ImportBatchState {
  const nextEntries = [...state.entries, ...entries]
  return { entries: nextEntries, status: nextStatus(nextEntries) }
}

export function markBatchReady(state: ImportBatchState): ImportBatchState {
  const summary = summarizeBatch(state)
  if (!summary.visibleOfferCount) return { ...state, status: 'empty' }
  return { ...state, status: 'ready_to_analyze' }
}

export function removeBatchReport(state: ImportBatchState, reportId: string): ImportBatchState {
  const entries = state.entries.filter((entry) => entry.id !== reportId)
  return { entries, status: nextStatus(entries) }
}

export function removeBatchOffer(state: ImportBatchState, reportId: string, offerId: string): ImportBatchState {
  const entries = state.entries.map((entry) => {
    if (entry.kind !== 'report' || entry.id !== reportId || entry.removedOfferIds.includes(offerId)) return entry
    return { ...entry, removedOfferIds: [...entry.removedOfferIds, offerId] }
  })
  return { entries, status: nextStatus(entries) }
}

export function restoreBatchOffers(state: ImportBatchState): ImportBatchState {
  const entries = state.entries.map((entry) => entry.kind === 'report' ? { ...entry, removedOfferIds: [] } : entry)
  return { entries, status: nextStatus(entries) }
}

function localDuplicateKey(offer: ImportedJobOffer) {
  return offer.sourceUrl?.trim().toLocaleLowerCase() || `${offer.company}|${offer.title}`.toLocaleLowerCase()
}

export function summarizeBatch(state: ImportBatchState): ImportBatchSummary {
  const reports = batchReports(state)
  const offers = reports.flatMap((entry) => entry.report.offers)
  const visible = reports.flatMap(visibleOffers)
  const seen = new Set<string>()
  let localDuplicateCount = 0
  for (const offer of offers) {
    const key = localDuplicateKey(offer)
    if (seen.has(key)) localDuplicateCount += 1
    else seen.add(key)
  }
  return {
    reportCount: reports.length,
    fileErrorCount: state.entries.filter((entry) => entry.kind === 'file_error').length,
    recognizedOfferCount: offers.length,
    visibleOfferCount: visible.length,
    warningCount: reports.reduce((total, entry) => total + reportWarnings(entry).length + entry.report.offers.reduce((offerTotal, offer) => offerTotal + offer.warnings.length, 0), 0),
    missingFieldCount: offers.reduce((total, offer) => total + offer.missingFields.length, 0),
    localDuplicateCount,
  }
}

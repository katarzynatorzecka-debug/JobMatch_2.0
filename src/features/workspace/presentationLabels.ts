import type { Recommendation, SourceQuality } from '../../contracts/jobAnalysis'
import type { AnalysisFreshnessStatus, AnalysisQueueStatus } from '../../contracts/workspace'
import { translate } from '../../i18n/I18nProvider'
import type { Locale } from '../../i18n/locale'
type HardFilterTranslationKey =
  | 'domain.hardFilter.contract'
  | 'domain.hardFilter.workMode'
  | 'domain.hardFilter.location'
  | 'domain.hardFilter.salary'
  | 'domain.hardFilter.keyword'
  | 'domain.hardFilter.studentStatus'
  | 'domain.hardFilter.mustHave'
  | 'domain.hardFilter.dataQuality'

const hardFilterCodeKeys: Record<string, HardFilterTranslationKey> = {
  contract: 'domain.hardFilter.contract',
  'missing-contract': 'domain.hardFilter.dataQuality',
  'ambiguous-contract': 'domain.hardFilter.dataQuality',
  'excluded-contract': 'domain.hardFilter.contract',
  'hard-contract-mismatch': 'domain.hardFilter.contract',
  'work-mode': 'domain.hardFilter.workMode',
  'missing-work-mode': 'domain.hardFilter.dataQuality',
  'ambiguous-work-mode': 'domain.hardFilter.dataQuality',
  'excluded-work-mode': 'domain.hardFilter.workMode',
  'hard-work-mode-mismatch': 'domain.hardFilter.workMode',
  location: 'domain.hardFilter.location',
  'hard-location-missing': 'domain.hardFilter.dataQuality',
  'hard-location-mismatch': 'domain.hardFilter.location',
  salary: 'domain.hardFilter.salary',
  keyword: 'domain.hardFilter.keyword',
  'student-status': 'domain.hardFilter.studentStatus',
  'student-status-required': 'domain.hardFilter.studentStatus',
  'must-have': 'domain.hardFilter.mustHave',
  'must-have-not-confirmed': 'domain.hardFilter.mustHave',
  'data-quality': 'domain.hardFilter.dataQuality',
}

const legacyHardFilterLabelKeys: Record<string, HardFilterTranslationKey> = {
  'brak informacji o rodzaju umowy': 'domain.hardFilter.dataQuality',
  'rodzaj umowy wymaga sprawdzenia': 'domain.hardFilter.dataQuality',
  'oferta zawiera wykluczony typ umowy': 'domain.hardFilter.contract',
  'oferta nie spelnia jawnie ustawionego twardego warunku formy zatrudnienia': 'domain.hardFilter.contract',
  'brak informacji o trybie pracy': 'domain.hardFilter.dataQuality',
  'tryb pracy wymaga sprawdzenia': 'domain.hardFilter.dataQuality',
  'oferta zawiera wykluczony tryb pracy': 'domain.hardFilter.workMode',
  'oferta nie spelnia jawnie ustawionego twardego warunku trybu pracy': 'domain.hardFilter.workMode',
  'brak informacji potrzebnej do sprawdzenia twardej lokalizacji': 'domain.hardFilter.dataQuality',
  'oferta nie spelnia jawnie ustawionego twardego warunku lokalizacji': 'domain.hardFilter.location',
  'oferta zawiera wykluczone slowo lub fraze': 'domain.hardFilter.keyword',
  'oferta wymaga statusu studenta ktorego profil nie potwierdza': 'domain.hardFilter.studentStatus',
  'dodatkowe must have nie jest potwierdzone przez dostepne dane oferty': 'domain.hardFilter.mustHave',
}

function legacyLabelKey(value: string): HardFilterTranslationKey | null {
  const normalized = value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  return legacyHardFilterLabelKeys[normalized] ?? null
}

function reasonKey(code: string | null): HardFilterTranslationKey | null {
  if (!code) return null
  if (code.startsWith('excluded-keyword:')) return 'domain.hardFilter.keyword'
  return hardFilterCodeKeys[code] ?? null
}

export function hardFilterReasonLabel(value: unknown, locale: Locale = 'pl'): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    const key = reasonKey(text) ?? legacyLabelKey(text)
    return key ? translate(locale, key) : text.includes('_') ? translate(locale, 'domain.hardFilter.conflict') : text
  }
  if (!value || typeof value !== 'object') return null
  const record = value as { label?: unknown; code?: unknown; category?: unknown }
  const code = typeof record.code === 'string' ? record.code : typeof record.category === 'string' ? record.category : null
  const key = reasonKey(code)
  if (key) return translate(locale, key)
  if (typeof record.label === 'string' && record.label.trim()) return record.label.trim()
  return code ? translate(locale, 'domain.hardFilter.conflict') : null
}

export function hardFilterReasonLabels(reasons: unknown[], locale: Locale = 'pl'): string[] {
  return reasons.map((reason) => hardFilterReasonLabel(reason, locale)).filter((label): label is string => Boolean(label))
}

export function recommendationLabel(value: Recommendation | string, locale: Locale = 'pl'): string {
  if (value === 'Warto aplikować') return translate(locale, 'domain.recommendation.worth')
  if (value === 'Nie rekomenduję') return translate(locale, 'domain.recommendation.notRecommended')
  if (value === 'Wymaga sprawdzenia') return translate(locale, 'domain.recommendation.review')
  return value
}

export function criterionOutcomeLabel(value: string, locale: Locale = 'pl'): string {
  switch (value) {
    case 'MATCH': return translate(locale, 'domain.criterion.match')
    case 'PARTIAL': return translate(locale, 'domain.criterion.partial')
    case 'NO_MATCH': return translate(locale, 'domain.criterion.noMatch')
    case 'UNKNOWN': return translate(locale, 'domain.criterion.unknown')
    default: return translate(locale, 'domain.criterion.unavailable')
  }
}

export function criterionMatchTypeLabel(value: string | undefined, locale: Locale = 'pl'): string | null {
  switch (value) {
    case 'direct': return translate(locale, 'domain.matchType.direct')
    case 'transferable': return translate(locale, 'domain.matchType.transferable')
    case 'no_evidence': return translate(locale, 'domain.matchType.noEvidence')
    case 'contradiction': return translate(locale, 'domain.matchType.contradiction')
    default: return null
  }
}

export function sourceQualityLabel(value: SourceQuality | string | null | undefined, locale: Locale = 'pl'): string {
  switch (value) {
    case 'full': return translate(locale, 'domain.source.full')
    case 'partial': return translate(locale, 'domain.source.partial')
    case 'unavailable': return translate(locale, 'domain.source.unavailable')
    case 'fixture': return translate(locale, 'domain.source.fixture')
    default: return translate(locale, 'domain.source.unknown')
  }
}

export function analysisFreshnessLabel(value: AnalysisFreshnessStatus, locale: Locale = 'pl'): string {
  if (value === 'current') return translate(locale, 'domain.analysis.current')
  if (value === 'missing') return translate(locale, 'domain.analysis.missing')
  return translate(locale, 'domain.analysis.stale')
}

export function analysisStateLabel(input: { queueStatus?: AnalysisQueueStatus | null; errorCode?: string | null; freshness: AnalysisFreshnessStatus }, locale: Locale = 'pl'): string {
  if (input.errorCode) return translate(locale, 'domain.analysis.failed')
  if (input.queueStatus === 'queued') return translate(locale, 'domain.analysis.queued')
  if (input.queueStatus === 'processing') return translate(locale, 'domain.analysis.processing')
  return analysisFreshnessLabel(input.freshness, locale)
}

export function analysisErrorLabel(value: string | null | undefined, locale: Locale = 'pl'): string {
  if (!value) return translate(locale, 'domain.analysis.failed')
  return /^[A-Z][A-Z0-9_:-]+$/.test(value.trim()) ? translate(locale, 'domain.analysis.failed') : value
}

export function analysisStatusLabel(value: string, locale: Locale = 'pl'): string {
  if (value === 'ready') return translate(locale, 'domain.analysis.status.ready')
  if (value === 'retry') return translate(locale, 'domain.analysis.status.retry')
  return translate(locale, 'domain.analysis.status.rejected')
}

export function analysisHistoryLabel(value: 'current' | 'previous', locale: Locale = 'pl'): string {
  return translate(locale, value === 'current' ? 'domain.history.current' : 'domain.history.previous')
}

export function analysisDateLabel(value: string | null | undefined, locale: Locale = 'pl'): string {
  if (!value) return translate(locale, 'domain.analysis.dateUnavailable')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return translate(locale, 'domain.analysis.dateUnavailable')
  const formatted = new Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  return translate(locale, 'domain.analysis.date', { date: formatted })
}

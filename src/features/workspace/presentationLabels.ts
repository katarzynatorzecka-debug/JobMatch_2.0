import type { SourceQuality } from '../../contracts/jobAnalysis'
import type { AnalysisFreshnessStatus, AnalysisQueueStatus } from '../../contracts/workspace'

const hardFilterCodeLabels: Record<string, string> = {
  contract: 'Rodzaj umowy nie odpowiada preferencjom profilu.',
  'work-mode': 'Tryb pracy nie odpowiada preferencjom profilu.',
  location: 'Lokalizacja nie odpowiada preferencjom profilu.',
  salary: 'Wynagrodzenie nie spelnia wymagan profilu.',
  keyword: 'Oferta nie zawiera wymaganego obszaru lub slowa kluczowego.',
  'student-status': 'Wymagany status studenta nie zostal potwierdzony.',
  'must-have': 'Oferta nie spelnia wymaganego kryterium.',
  'data-quality': 'Brakuje danych potrzebnych do pelnej weryfikacji.',
}

export function hardFilterReasonLabel(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    return hardFilterCodeLabels[text] ?? (text.includes('_') ? 'Oferta ma konflikt z wymaganiami profilu.' : text)
  }
  if (!value || typeof value !== 'object') return null
  const record = value as { label?: unknown; code?: unknown; category?: unknown }
  if (typeof record.label === 'string' && record.label.trim()) return record.label.trim()
  const code = typeof record.code === 'string' ? record.code : typeof record.category === 'string' ? record.category : null
  return code ? hardFilterCodeLabels[code] ?? 'Oferta ma konflikt z wymaganiami profilu.' : null
}

export function hardFilterReasonLabels(reasons: unknown[]): string[] {
  return reasons.map(hardFilterReasonLabel).filter((label): label is string => Boolean(label))
}

export function sourceQualityLabel(value: SourceQuality | string | null | undefined): string {
  switch (value) {
    case 'full': return 'Pelne dane oferty'
    case 'partial': return 'Czesciowe dane oferty'
    case 'unavailable': return 'Brak danych zródlowych'
    case 'fixture': return 'Dane demonstracyjne'
    default: return 'Jakosc danych zródlowych nieznana'
  }
}

export function analysisFreshnessLabel(value: AnalysisFreshnessStatus): string {
  switch (value) {
    case 'current': return 'Przeanalizowana'
    case 'missing': return 'Nieprzeanalizowana'
    default: return 'Wynik wymaga ponownej analizy'
  }
}

export function analysisStateLabel(input: { queueStatus?: AnalysisQueueStatus | null; errorCode?: string | null; freshness: AnalysisFreshnessStatus }): string {
  if (input.errorCode) return 'Analiza nie powiodla sie. Spróbuj ponownie.'
  if (input.queueStatus === 'queued') return 'Oczekuje na analize'
  if (input.queueStatus === 'processing') return 'Analiza w toku'
  return analysisFreshnessLabel(input.freshness)
}

export function analysisDateLabel(value: string | null | undefined): string {
  if (!value) return 'Data analizy niedostepna'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data analizy niedostepna' : `Analizowano: ${new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}`
}

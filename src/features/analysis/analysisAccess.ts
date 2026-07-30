import type { AppMode } from '../access/AppModeProvider'

export type AnalysisAccess =
  | { allowed: true }
  | { allowed: false; code: 'ANALYSIS_NOT_STARTED'; message: string }

export function getAnalysisAccess(mode: AppMode | null, hasSession: boolean): AnalysisAccess {
  if (mode === 'authenticated' && hasSession) return { allowed: true }
  return {
    allowed: false,
    code: 'ANALYSIS_NOT_STARTED',
    message: 'Analiza AI jest dostępna po zalogowaniu. W trybie demo wykonaliśmy Hard Filter lokalnie i nie wysyłamy danych do Supabase.',
  }
}

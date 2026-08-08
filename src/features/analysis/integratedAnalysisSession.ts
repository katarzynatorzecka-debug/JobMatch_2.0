import type { ImportBatchState } from '../import/importBatchState'
import type { IntegratedBatchCounts, IntegratedOfferProgress } from './integratedAnalysisFlow'

export const INTEGRATED_ANALYSIS_SESSION_KEY = 'jobmatch.integrated-analysis.batch.v1'
export type PersistedPipelineState = 'idle' | 'running' | 'complete' | 'partial_complete'
export type IntegratedAnalysisSession = { batch: ImportBatchState; pipeline: PersistedPipelineState; progress: Record<string, IntegratedOfferProgress>; counts: IntegratedBatchCounts }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browserStorage = (): StorageLike | null => typeof window === 'undefined' ? null : window.sessionStorage
const scopedKey = (scope?: string) => scope ? `${INTEGRATED_ANALYSIS_SESSION_KEY}.${scope}` : INTEGRATED_ANALYSIS_SESSION_KEY

export function loadIntegratedAnalysisSession(storage: StorageLike | null = browserStorage(), scope?: string): IntegratedAnalysisSession | null {
  try {
    const raw = storage?.getItem(scopedKey(scope)); if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IntegratedAnalysisSession>
    if (!parsed.batch || !Array.isArray(parsed.batch.entries) || !parsed.progress || typeof parsed.progress !== 'object' || !parsed.counts || typeof parsed.counts !== 'object') return null
    if (!['idle', 'running', 'complete', 'partial_complete'].includes(String(parsed.pipeline))) return null
    const progress = parsed.progress as Record<string, IntegratedOfferProgress>
    if (parsed.pipeline === 'running') {
      const restored = Object.fromEntries(Object.entries(progress).map(([key, entry]) => entry.state === 'hard_filtering' || entry.state === 'queued' || entry.state === 'processing' ? [key, { ...entry, state: 'failed' as const, error: 'ANALYSIS_INTERRUPTED_BY_REFRESH' }] : [key, entry]))
      const failed = Object.values(restored).filter((entry) => entry.state === 'failed').length
      return { batch: parsed.batch, pipeline: 'partial_complete', progress: restored, counts: { ...(parsed.counts as IntegratedBatchCounts), processing: 0, queued: 0, failed } }
    }
    return parsed as IntegratedAnalysisSession
  } catch { return null }
}

export function saveIntegratedAnalysisSession(value: IntegratedAnalysisSession, storage: StorageLike | null = browserStorage(), scope?: string) {
  try { storage?.setItem(scopedKey(scope), JSON.stringify(value)); return true } catch { return false }
}

export function clearIntegratedAnalysisSession(storage: StorageLike | null = browserStorage(), scope?: string) { try { storage?.removeItem(scopedKey(scope)) } catch { /* browser storage may be unavailable */ } }

import { describe, expect, it } from 'vitest'
import { INTEGRATED_ANALYSIS_SESSION_KEY, loadIntegratedAnalysisSession, saveIntegratedAnalysisSession } from './integratedAnalysisSession'

const storage = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) }, values } }
const snapshot = { batch: { status: 'review' as const, entries: [] }, pipeline: 'running' as const, progress: { one: { key: 'one', offer: { id: 'offer', title: 'Offer', company: 'Company', missingFields: [], warnings: [] }, state: 'processing' as const } }, counts: { total: 1, hardFilterRejected: 0, queued: 0, processing: 1, completed: 0, failed: 0 } }

describe('integrated analysis session', () => {
  it('stores normalized batch state only in session storage', () => { const target = storage(); expect(saveIntegratedAnalysisSession(snapshot, target)).toBe(true); expect(target.values.get(INTEGRATED_ANALYSIS_SESSION_KEY)).not.toContain('rawEml') })
  it('restores visible progress after refresh without pretending an interrupted worker is active', () => { const target = storage(); saveIntegratedAnalysisSession(snapshot, target); expect(loadIntegratedAnalysisSession(target)).toMatchObject({ pipeline: 'partial_complete', progress: { one: { state: 'failed', error: 'ANALYSIS_INTERRUPTED_BY_REFRESH' } }, counts: { processing: 0, failed: 1 } }) })
  it('keeps demo and authenticated recovery snapshots separate', () => { const target = storage(); saveIntegratedAnalysisSession(snapshot, target, 'demo'); expect(loadIntegratedAnalysisSession(target, 'authenticated-user')).toBeNull(); expect(loadIntegratedAnalysisSession(target, 'demo')).toMatchObject({ pipeline: 'partial_complete' }) })
})

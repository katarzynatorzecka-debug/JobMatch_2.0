import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../workspace/workspaceRepository'
import { restoreActiveWorkspaceImport, shouldResetTerminalBatchForNewFiles, shouldRestoreWorkspaceImport } from './restoredWorkspaceImport'
const restoreLatestWorkspaceImport = (value: WorkspaceSnapshot) => restoreActiveWorkspaceImport({ ...value, activeImportSessionId: 'session-1' })

const analysis = { offerId: 'offer-1', overallScore: 72, categoryScores: { experience: { score: 70, rationale: 'Zbieżne zadania.' }, skills: { score: 75, rationale: 'Istotne umiejętności.' }, preferences: { score: 68, rationale: 'Część preferencji potwierdzona.' }, growth: { score: 74, rationale: 'Rola wspiera kierunek.' } }, recommendation: 'Warto aplikować', summary: 'Dobre dopasowanie.', strengths: ['Automatyzacja'], risks: ['Brak widełek'], missingInformation: ['wynagrodzenie'], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'test', provisional: false }, createdAt: '2026-07-29T10:00:00.000Z', status: 'ready' }
const offer = { id: 'offer-1', title: 'Oferta testowa', company: 'JobMatch', location: 'Warszawa', sourceUrl: 'https://rocketjobs.pl/oferta-pracy/test', currentVersionId: 'offer-version', currentData: { missingFields: [], warnings: [] }, createdAt: '2026-08-06T10:00:00.000Z', lastSeenAt: '2026-08-06T10:00:00.000Z' } as never

function snapshot(): WorkspaceSnapshot {
  return { profile: { currentVersionId: 'profile-version' } as never, importSessions: [{ id: 'session-1', status: 'active', sourceFilename: 'raport.eml', createdAt: '2026-08-06T10:00:00.000Z' } as never], offers: [offer], activeOffers: [offer], profileVersions: [], offerVersions: [{ id: 'offer-version', jobOfferId: 'offer-1', offerData: { missingFields: [], warnings: [] } } as never], importOfferLinks: [{ importSessionId: 'session-1', jobOfferId: 'offer-1', rawExternalId: 'external-1' } as never], offerUserStates: [{ jobOfferId: 'offer-1', lifecycleStatus: 'analyzed' } as never], hardFilterResults: [{ jobOfferId: 'offer-1', isCurrent: true, status: 'pass' } as never], analyses: [], legacyAnalysisIssues: [], analysisQueue: [], workspaceAnalyses: [{ jobOfferId: 'offer-1', latestVersionId: 'analysis-version-1' } as never], analysisVersions: [{ id: 'analysis-version-1', jobOfferId: 'offer-1', offerVersionId: 'offer-version', profileVersionId: 'profile-version', analysisData: analysis, hardFilterStatus: 'pass', createdAt: '2026-08-06T10:00:00.000Z', algorithmVersion: 'jobmatch-deterministic-r1', promptVersion: 'jobmatch-job-match-v1', modelVersion: 'gpt-5.4-mini' } as never], recentlyViewed: [] }
}

describe('restoreLatestWorkspaceImport', () => {
  it('does not restore a historical batch after the user has started a fresh one', () => {
    expect(shouldRestoreWorkspaceImport({ alreadyRestored: false, isAuthenticated: true, hasBatchEntries: false, pipeline: 'idle', freshBatchStarted: false })).toBe(true)
    expect(shouldRestoreWorkspaceImport({ alreadyRestored: false, isAuthenticated: true, hasBatchEntries: true, pipeline: 'idle', freshBatchStarted: false })).toBe(false)
    expect(shouldRestoreWorkspaceImport({ alreadyRestored: false, isAuthenticated: true, hasBatchEntries: true, pipeline: 'partial_complete', freshBatchStarted: false })).toBe(true)
    expect(shouldRestoreWorkspaceImport({ alreadyRestored: false, isAuthenticated: true, hasBatchEntries: false, pipeline: 'idle', freshBatchStarted: true })).toBe(false)
    expect(shouldRestoreWorkspaceImport({ alreadyRestored: false, isAuthenticated: true, hasBatchEntries: false, pipeline: 'idle', freshBatchStarted: false, hasExplicitEmptyBatch: true })).toBe(false)
  })

  it('starts a new packet when files are added after a terminal batch', () => {
    expect(shouldResetTerminalBatchForNewFiles('complete')).toBe(true)
    expect(shouldResetTerminalBatchForNewFiles('partial_complete')).toBe(true)
    expect(shouldResetTerminalBatchForNewFiles('idle')).toBe(false)
    expect(shouldResetTerminalBatchForNewFiles('running')).toBe(false)
  })

  it('restores a completed persisted batch with the current score, recommendation, Hard Filter, freshness and version ID', () => {
    expect(restoreLatestWorkspaceImport(snapshot())).toMatchObject({ pipeline: 'complete', counts: { total: 1, completed: 1 }, progress: { 'session-1:external-1': { state: 'completed', hardFilterStatus: 'pass', analysis: { overallScore: 72, recommendation: 'Warto aplikować' }, freshness: 'stale_algorithm', analysisVersionId: 'analysis-version-1' } } })
  })

  it('preserves NEEDS_REVIEW as a completed analysis and never turns a missing HF result into rejection', () => {
    const weak = snapshot(); weak.hardFilterResults = [{ jobOfferId: 'offer-1', isCurrent: true, status: 'needs_review' } as never]
    weak.analysisVersions = [{ ...(weak.analysisVersions[0] as object), hardFilterStatus: 'weak', analysisData: { ...analysis, hardFilterStatus: 'weak' } } as never]
    expect(restoreLatestWorkspaceImport(weak)).toMatchObject({ progress: { 'session-1:external-1': { state: 'completed', hardFilterStatus: 'weak' } } })
    const missing = snapshot(); missing.hardFilterResults = []
    expect(restoreLatestWorkspaceImport(missing)).toBeNull()
  })

  it('restores only a persisted FAIL as rejected and without an analysis score', () => {
    const failed = snapshot(); failed.hardFilterResults = [{ jobOfferId: 'offer-1', isCurrent: true, status: 'fail' } as never]; failed.workspaceAnalyses = []; failed.analysisVersions = []
    const restored = restoreLatestWorkspaceImport(failed)
    expect(restored).toMatchObject({ pipeline: 'complete', progress: { 'session-1:external-1': { state: 'rejected', hardFilterStatus: 'fail' } } })
    expect(restored?.progress['session-1:external-1']?.analysis).toBeUndefined()
  })

  it('does not fall back to a historical session when the active pointer is absent', () => {
    expect(restoreActiveWorkspaceImport(snapshot())).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { presentAnalysisHistory } from './analysisHistoryPresentation'

const version = (id: string, createdAt: string, score: number, recommendation: 'Warto aplikować' | 'Wymaga sprawdzenia' | 'Nie rekomenduję') => ({ id, createdAt, analysisData: { offerId: 'internal-offer', overallScore: score, recommendation, summary: `Podsumowanie ${score}`, categoryScores: { experience: { score, rationale: 'ok' }, skills: { score, rationale: 'ok' }, preferences: { score, rationale: 'ok' }, growth: { score, rationale: 'ok' } }, strengths: [], risks: [], missingInformation: [], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'test', provisional: false }, status: 'ready', createdAt, scoring: { algorithmVersion: 'test', weights: { experience: 25, skills: 25, preferences: 25, growth: 25 }, coverage: 80, criterionConfidence: 80, reliability: 'limited', scoredCategories: ['experience', 'skills', 'preferences', 'growth'] } } } as never)

describe('analysis history presentation', () => {
  it('marks the latest pointer as current and earlier versions as previous', () => {
    const entries = presentAnalysisHistory([version('old', '2026-08-01T10:00:00.000Z', 40, 'Wymaga sprawdzenia'), version('latest', '2026-08-02T10:00:00.000Z', 80, 'Warto aplikować')], 'latest')
    expect(entries.map((entry) => [entry.kind, entry.analysis?.overallScore])).toEqual([['current', 80], ['previous', 40]])
    expect(JSON.stringify(entries)).not.toContain('internal-offer')
  })

  it('returns a safe unavailable entry for malformed history data', () => {
    const [entry] = presentAnalysisHistory([version('only', '2026-08-02T10:00:00.000Z', 80, 'Warto aplikować')], 'only')
    expect(entry.kind).toBe('current')
    expect(entry.createdAt).toContain('2026-08-02')
  })
})

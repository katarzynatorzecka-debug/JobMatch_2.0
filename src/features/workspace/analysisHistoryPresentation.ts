import type { JobAnalysis } from '../../contracts/jobAnalysis'
import type { AnalysisVersion } from '../../contracts/workspace'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import { analysisSummaryForLocale } from '../analysis/analysisLocalization'

export type AnalysisHistoryPresentation = {
  kind: 'current' | 'previous'
  createdAt: string
  analysis: Pick<JobAnalysis, 'overallScore' | 'recommendation' | 'summary' | 'scoring' | 'sourceQuality' | 'status'> | null
}

export function presentAnalysisHistory(versions: AnalysisVersion[], latestVersionId: string | null, locale: 'pl' | 'en' = 'pl'): AnalysisHistoryPresentation[] {
  const orderedVersions = [...versions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const effectiveLatestVersionId = latestVersionId ?? orderedVersions[0]?.id ?? null
  return orderedVersions.map((version) => {
    const parsed = validateJobAnalysis(version.analysisData)
    return {
      kind: version.id === effectiveLatestVersionId ? 'current' : 'previous',
      createdAt: version.createdAt,
      analysis: parsed.success ? {
        overallScore: parsed.data.overallScore,
        recommendation: parsed.data.recommendation,
        summary: analysisSummaryForLocale(parsed.data, locale),
        scoring: parsed.data.scoring,
        sourceQuality: parsed.data.sourceQuality,
        status: parsed.data.status,
      } : null,
    }
  })
}

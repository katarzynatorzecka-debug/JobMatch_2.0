import type { JobAnalysis } from '../../contracts/jobAnalysis'
import type { AnalysisVersion } from '../../contracts/workspace'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'

export type AnalysisHistoryPresentation = {
  label: 'Aktualna' | 'Poprzednia'
  createdAt: string
  analysis: Pick<JobAnalysis, 'overallScore' | 'recommendation' | 'summary' | 'scoring' | 'sourceQuality' | 'status'> | null
}

export function presentAnalysisHistory(versions: AnalysisVersion[], latestVersionId: string | null): AnalysisHistoryPresentation[] {
  const orderedVersions = [...versions].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const effectiveLatestVersionId = latestVersionId ?? orderedVersions[0]?.id ?? null
  return orderedVersions.map((version) => {
    const parsed = validateJobAnalysis(version.analysisData)
    return {
      label: version.id === effectiveLatestVersionId ? 'Aktualna' : 'Poprzednia',
      createdAt: version.createdAt,
      analysis: parsed.success ? {
        overallScore: parsed.data.overallScore,
        recommendation: parsed.data.recommendation,
        summary: parsed.data.summary,
        scoring: parsed.data.scoring,
        sourceQuality: parsed.data.sourceQuality,
        status: parsed.data.status,
      } : null,
    }
  })
}
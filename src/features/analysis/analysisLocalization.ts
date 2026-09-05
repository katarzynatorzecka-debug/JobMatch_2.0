import type { AnalysisCriterion, AnalysisLocale, JobAnalysis, LocalizedAnalysisNarrative } from '../../contracts/jobAnalysis'

export function analysisNarrativeForLocale(analysis: JobAnalysis, locale: AnalysisLocale): LocalizedAnalysisNarrative {
  return analysis.localizedContent?.[locale] ?? {
    summary: analysis.summary,
    strengths: analysis.strengths,
    risks: analysis.risks,
    missingInformation: analysis.missingInformation,
  }
}

export function analysisSummaryForLocale(analysis: JobAnalysis, locale: AnalysisLocale) {
  return analysisNarrativeForLocale(analysis, locale).summary
}

export function criterionRationaleForLocale(criterion: AnalysisCriterion, locale: AnalysisLocale) {
  return criterion.localizedRationale?.[locale] ?? criterion.rationale
}

import type { JobAnalysis } from '../../contracts/jobAnalysis'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import { supabase } from '../supabase/client'

const pending = new Map<string, Promise<JobAnalysis>>()

export function ensureAnalysisLocalization(analysisVersionId: string): Promise<JobAnalysis> {
  const existing = pending.get(analysisVersionId)
  if (existing) return existing
  const request = (async () => {
    if (!supabase) throw new Error('ANALYSIS_LOCALIZATION_AUTH_REQUIRED')
    const { data, error } = await supabase.functions.invoke('localize-analysis', { body: { analysisVersionId } })
    if (error || !data || typeof data !== 'object' || !('analysis' in data)) throw new Error('ANALYSIS_LOCALIZATION_FAILED')
    const parsed = validateJobAnalysis(data.analysis)
    if (!parsed.success) throw new Error('ANALYSIS_LOCALIZATION_SCHEMA_MISMATCH')
    return parsed.data
  })().finally(() => pending.delete(analysisVersionId))
  pending.set(analysisVersionId, request)
  return request
}

import type { FilteredJobOffer } from '../../contracts/hardFilter'
import type { JobAnalysis, OfferContent } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import { supabase } from '../supabase/client'

export type AnalysisDiagnosticCode = 'OPENAI_REFUSAL' | 'OPENAI_INCOMPLETE' | 'OPENAI_EMPTY_OUTPUT' | 'OPENAI_SCHEMA_MISMATCH' | 'EDGE_RESPONSE_SCHEMA_MISMATCH' | 'OPENAI_HTTP_ERROR' | 'OPENAI_NOT_CONFIGURED' | 'ANALYSIS_REQUEST_FAILED'
export class AnalysisError extends Error { constructor(readonly code: AnalysisDiagnosticCode) { super(code) } }

export class AIAnalysisService {
  async analyze(profile: UserProfile, item: FilteredJobOffer, content: OfferContent): Promise<JobAnalysis> {
    if (!supabase) throw new AnalysisError('ANALYSIS_REQUEST_FAILED')
    const payload = { profile, offer: item.offer, hardFilter: item.result, offerContent: content.text || undefined, sourceQuality: content.sourceQuality }
    let lastError: AnalysisError = new AnalysisError('ANALYSIS_REQUEST_FAILED')
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error } = await supabase.functions.invoke('analyze-job-match', { body: payload })
      if (!error) {
        const parsed = validateJobAnalysis(data)
        if (parsed.success) return parsed.data
        console.info('EDGE_RESPONSE_SCHEMA_MISMATCH', parsed.error.issues.map((issue) => issue.path.join('.')))
        throw new AnalysisError('EDGE_RESPONSE_SCHEMA_MISMATCH')
      }
      const response = (error as { context?: Response }).context
      const body = response ? await response.json().catch(() => null) as { code?: AnalysisDiagnosticCode } | null : null
      const code = body?.code ?? 'ANALYSIS_REQUEST_FAILED'
      lastError = new AnalysisError(code)
      if (code !== 'ANALYSIS_REQUEST_FAILED') break
    }
    throw lastError
  }
}

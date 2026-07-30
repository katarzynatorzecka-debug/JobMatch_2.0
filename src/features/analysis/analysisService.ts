import type { FilteredJobOffer } from '../../contracts/hardFilter'
import type { JobAnalysis, OfferContent } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import { validateJobAnalysis } from '../../schemas/jobAnalysisSchemas'
import { supabase } from '../supabase/client'

export type AnalysisDiagnosticCode = 'ANALYSIS_NOT_STARTED' | 'ANALYSIS_ORCHESTRATOR_NOT_CALLED' | 'EDGE_FUNCTION_NOT_INVOKED' | 'EDGE_FUNCTION_HTTP_ERROR' | 'EDGE_FUNCTION_UNDEPLOYED' | 'EDGE_FUNCTION_PROJECT_MISMATCH' | 'OPENAI_SECRET_MISSING' | 'OPENAI_REFUSAL' | 'OPENAI_INCOMPLETE' | 'OPENAI_EMPTY_OUTPUT' | 'OPENAI_SCHEMA_MISMATCH' | 'EDGE_RESPONSE_SCHEMA_MISMATCH' | 'ANALYSIS_SAVE_FAILED' | 'ANALYSIS_READ_FAILED' | 'ANALYSIS_REQUEST_FAILED'
export class AnalysisError extends Error { constructor(readonly code: AnalysisDiagnosticCode) { super(code) } }

type FunctionFailure = { status?: number; code?: string }
export function diagnosticCodeForFunctionFailure({ status, code }: FunctionFailure): AnalysisDiagnosticCode {
  if (code === 'OPENAI_NOT_CONFIGURED') return 'OPENAI_SECRET_MISSING'
  if (code && ['OPENAI_REFUSAL', 'OPENAI_INCOMPLETE', 'OPENAI_EMPTY_OUTPUT', 'OPENAI_SCHEMA_MISMATCH'].includes(code)) return code as AnalysisDiagnosticCode
  if (status === 404) return 'EDGE_FUNCTION_UNDEPLOYED'
  if (status && status >= 400) return 'EDGE_FUNCTION_HTTP_ERROR'
  return 'EDGE_FUNCTION_NOT_INVOKED'
}

export class AIAnalysisService {
  async analyze(profile: UserProfile, item: FilteredJobOffer, content: OfferContent): Promise<JobAnalysis> {
    if (!supabase) throw new AnalysisError('EDGE_FUNCTION_NOT_INVOKED')
    const payload = { profile, offer: item.offer, hardFilter: item.result, offerContent: content.text || undefined, sourceQuality: content.sourceQuality }
    let lastError: AnalysisError = new AnalysisError('EDGE_FUNCTION_NOT_INVOKED')
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const startedAt = Date.now()
      const { data, error } = await supabase.functions.invoke('analyze-job-match', { body: payload })
      if (!error) {
        const parsed = validateJobAnalysis(data)
        if (parsed.success) return parsed.data
        console.info('EDGE_RESPONSE_SCHEMA_MISMATCH', parsed.error.issues.map((issue) => issue.path.join('.')))
        throw new AnalysisError('EDGE_RESPONSE_SCHEMA_MISMATCH')
      }
      const response = (error as { context?: Response }).context
      const body = response ? await response.json().catch(() => null) as { code?: AnalysisDiagnosticCode } | null : null
      const code = diagnosticCodeForFunctionFailure({ status: response?.status, code: body?.code })
      console.info('EDGE_FUNCTION_ERROR', { status: response?.status ?? null, code, requestId: response?.headers.get('x-request-id') ?? null, durationMs: Date.now() - startedAt })
      lastError = new AnalysisError(code)
      if (!['EDGE_FUNCTION_NOT_INVOKED', 'EDGE_FUNCTION_HTTP_ERROR'].includes(code)) break
    }
    throw lastError
  }
}

import { describe, expect, it } from 'vitest'
import { diagnosticCodeForFunctionFailure } from './analysisService'

describe('diagnosticCodeForFunctionFailure', () => {
  it('distinguishes a missing Edge Function from a generic HTTP failure', () => {
    expect(diagnosticCodeForFunctionFailure({ status: 404 })).toBe('EDGE_FUNCTION_UNDEPLOYED')
    expect(diagnosticCodeForFunctionFailure({ status: 502 })).toBe('EDGE_FUNCTION_HTTP_ERROR')
  })

  it('maps the protected OpenAI configuration error without exposing a secret', () => {
    expect(diagnosticCodeForFunctionFailure({ status: 503, code: 'OPENAI_NOT_CONFIGURED' })).toBe('OPENAI_SECRET_MISSING')
  })

  it('keeps Structured Outputs diagnostic codes intact', () => {
    expect(diagnosticCodeForFunctionFailure({ status: 502, code: 'OPENAI_REFUSAL' })).toBe('OPENAI_REFUSAL')
  })
})

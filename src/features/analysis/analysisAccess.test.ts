import { describe, expect, it } from 'vitest'
import { getAnalysisAccess } from './analysisAccess'

describe('getAnalysisAccess', () => {
  it('allows the Edge Function only for an authenticated session', () => {
    expect(getAnalysisAccess('authenticated', true)).toEqual({ allowed: true })
  })

  it('keeps demo data out of the Edge Function and returns a visible diagnostic code', () => {
    expect(getAnalysisAccess('demo', false)).toMatchObject({ allowed: false, code: 'ANALYSIS_NOT_STARTED' })
  })
})

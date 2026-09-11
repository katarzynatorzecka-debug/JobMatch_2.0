import { describe, expect, it } from 'vitest'
import edgeSource from '../../../supabase/functions/localize-analysis/index.ts?raw'

describe('analysis localization Edge boundary', () => {
  it('checks authenticated ownership before reading or updating an analysis version', () => {
    expect(edgeSource).toContain(".eq('user_id', auth.user.id)")
    expect(edgeSource).toContain(".from('analysis_versions').update({ analysis_data: nextAnalysis })")
  })

  it('localizes presentation fields while preserving the existing analysis object', () => {
    expect(edgeSource).toContain('const nextAnalysis = { ...analysis, localizedContent: content, criteria: nextCriteria }')
    expect(edgeSource).not.toContain('overallScore:')
    expect(edgeSource).not.toContain('recommendation:')
  })

  it('reuses a persisted localization and validates criterion identity', () => {
    expect(edgeSource).toContain('if (alreadyLocalized(analysis))')
    expect(edgeSource).toContain('item.id !== ids[index]')
  })
})

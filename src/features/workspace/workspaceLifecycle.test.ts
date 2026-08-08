import { describe, expect, it } from 'vitest'
import { fallbackLifecycle, lifecycleForHardFilter, resolveLifecycle } from './workspaceLifecycle'

describe('workspace lifecycle rules', () => {
  it('maps persistent Hard Filter statuses to lifecycle states', () => {
    expect(lifecycleForHardFilter('pass')).toBe('new')
    expect(lifecycleForHardFilter('needs_review')).toBe('needs_review')
    expect(lifecycleForHardFilter('fail')).toBe('excluded')
  })

  it('applies the required priority: excluded, analyzed, needs_review, new', () => {
    expect(resolveLifecycle({ current: { lifecycleStatus: 'excluded' } as never, hardFilter: null, hasAnalysis: true })).toBe('excluded')
    expect(resolveLifecycle({ current: null, hardFilter: null, hasAnalysis: true })).toBe('analyzed')
    expect(resolveLifecycle({ current: null, hardFilter: { status: 'needs_review' } as never, hasAnalysis: false })).toBe('needs_review')
    expect(resolveLifecycle({ current: null, hardFilter: null, hasAnalysis: false })).toBe('new')
  })

  it('keeps a current HF FAIL above a restore fallback', () => {
    expect(fallbackLifecycle({ hardFilter: { status: 'fail' } as never, hasAnalysis: true, possibleDuplicate: true })).toBe('excluded')
  })
})

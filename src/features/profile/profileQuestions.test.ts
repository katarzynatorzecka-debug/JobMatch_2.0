import { describe, expect, it } from 'vitest'
import type { UserProfileDraft } from '../../contracts/profile'
import { defaultProfile } from './profileDefaults'
import { getProfileQuestions } from './profileQuestions'

const missingDraft: UserProfileDraft = { values: defaultProfile, confidence: { primaryRole: 'missing', alternativeRoles: 'missing', experienceSummary: 'missing', skills: 'missing' }, warnings: [], source: 'pasted-text', requiresAcceptance: true }

describe('profile onboarding questions', () => {
  it('asks about missing role and work preferences', () => {
    const ids = getProfileQuestions(missingDraft, defaultProfile).map((question) => question.id)
    expect(ids).toContain('role'); expect(ids).toContain('workModes'); expect(ids).toContain('locations')
  })
  it('skips a confidently recognised role but still asks for missing preferences', () => {
    const draft = { ...missingDraft, values: { ...defaultProfile, primaryRole: 'Service Specialist' }, confidence: { ...missingDraft.confidence, primaryRole: 'high' as const } }
    const ids = getProfileQuestions(draft, draft.values).map((question) => question.id)
    expect(ids).not.toContain('role'); expect(ids).toContain('workModes')
  })
  it('keeps CV values while answers are added to the profile state', () => {
    const profile = { ...defaultProfile, primaryRole: 'Recognised role', skills: ['SQL'], acceptedWorkModes: ['remote' as const] }
    expect(profile.primaryRole).toBe('Recognised role'); expect(profile.skills).toEqual(['SQL'])
  })
})

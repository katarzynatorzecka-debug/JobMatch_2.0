import { describe, expect, it } from 'vitest'
import type { UserProfileDraft } from '../../contracts/profile'
import { defaultProfile } from './profileDefaults'
import { applyOnboardingAnswers, discardOnboarding, profileFromRecognition } from './profileOnboarding'

const draft: UserProfileDraft = { values: { ...defaultProfile, primaryRole: 'Recognised role', experienceSummary: 'Rozpoznane podsumowanie doświadczenia wystarczająco długie do zapisu.', skills: ['SQL'] }, confidence: { primaryRole: 'high', alternativeRoles: 'missing', experienceSummary: 'high', skills: 'high' }, warnings: [], source: 'pdf', requiresAcceptance: true }

describe('profile onboarding state', () => {
  it('creates profile state from CV data without storage side effects', () => {
    expect(profileFromRecognition(draft).primaryRole).toBe('Recognised role')
  })
  it('keeps CV values after preference answers are added', () => {
    const answered = applyOnboardingAnswers(profileFromRecognition(draft), { acceptedWorkModes: ['remote'], acceptedLocations: ['Bydgoszcz'] })
    expect(answered.primaryRole).toBe('Recognised role'); expect(answered.skills).toEqual(['SQL']); expect(answered.acceptedLocations).toEqual(['Bydgoszcz'])
  })
  it('returns a previous saved profile when onboarding is discarded', () => {
    const saved = { ...defaultProfile, primaryRole: 'Saved role' }
    expect(discardOnboarding(saved)).toEqual(saved)
  })
})

import type { UserProfile, UserProfileDraft } from '../../contracts/profile'

export function profileFromRecognition(draft: UserProfileDraft): UserProfile {
  return { ...draft.values, alternativeRoles: [...draft.values.alternativeRoles], skills: [...draft.values.skills] }
}

export function applyOnboardingAnswers(profile: UserProfile, answers: Partial<UserProfile>): UserProfile {
  return { ...profile, ...answers, alternativeRoles: answers.alternativeRoles ?? profile.alternativeRoles, skills: answers.skills ?? profile.skills }
}

export function discardOnboarding(savedProfile: UserProfile | null): UserProfile | null { return savedProfile }

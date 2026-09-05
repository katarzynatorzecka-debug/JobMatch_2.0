import type { UserProfile, UserProfileDraft } from '../../contracts/profile'
import { translate } from '../../i18n/I18nProvider'
import type { Locale } from '../../i18n/locale'

export type ProfileQuestionId = 'role' | 'workModes' | 'contracts' | 'locations' | 'criteria' | 'priorities'
export interface ProfileQuestion { id: ProfileQuestionId; title: string; description: string; optional?: boolean }

function preferenceQuestions(locale: Locale): ProfileQuestion[] { return [
  { id: 'workModes', title: translate(locale, 'domain.profile.question.workModes.title'), description: translate(locale, 'domain.profile.question.workModes.description') },
  { id: 'contracts', title: translate(locale, 'domain.profile.question.contracts.title'), description: translate(locale, 'domain.profile.question.contracts.description') },
  { id: 'locations', title: translate(locale, 'domain.profile.question.locations.title'), description: translate(locale, 'domain.profile.question.locations.description') },
  { id: 'criteria', title: translate(locale, 'domain.profile.question.criteria.title'), description: translate(locale, 'domain.profile.question.criteria.description'), optional: true },
  { id: 'priorities', title: translate(locale, 'domain.profile.question.priorities.title'), description: translate(locale, 'domain.profile.question.priorities.description') },
] }

export function localizeProfileQuestion(question: ProfileQuestion, locale: Locale): ProfileQuestion {
  const localized = question.id === 'role'
    ? { title: translate(locale, 'domain.profile.question.role.title'), description: translate(locale, 'domain.profile.question.role.description') }
    : preferenceQuestions(locale).find((item) => item.id === question.id)
  return localized ? { ...question, title: localized.title, description: localized.description } : question
}

export function getProfileQuestions(draft: UserProfileDraft, currentProfile: UserProfile, locale: Locale = 'pl'): ProfileQuestion[] {
  const questions: ProfileQuestion[] = []
  const preferences = preferenceQuestions(locale)
  const roleIsCertain = draft.confidence.primaryRole === 'high' && Boolean(currentProfile.primaryRole.trim())
  if (!roleIsCertain) questions.push({ id: 'role', title: translate(locale, 'domain.profile.question.role.title'), description: translate(locale, 'domain.profile.question.role.description') })
  if (!currentProfile.acceptedWorkModes.length) questions.push(preferences[0])
  if (!currentProfile.acceptedContractTypes.length) questions.push(preferences[1])
  if (!currentProfile.acceptedLocations.length) questions.push(preferences[2])
  questions.push(preferences[3], preferences[4])
  return questions.slice(0, 6)
}

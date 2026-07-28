import type { UserProfile, UserProfileDraft } from '../../contracts/profile'

export type ProfileQuestionId = 'role' | 'workModes' | 'contracts' | 'locations' | 'criteria' | 'priorities'
export interface ProfileQuestion { id: ProfileQuestionId; title: string; description: string; optional?: boolean }

const preferenceQuestions: ProfileQuestion[] = [
  { id: 'workModes', title: 'Jakie tryby pracy akceptujesz?', description: 'Możesz wybrać więcej niż jedną odpowiedź.' },
  { id: 'contracts', title: 'Jakie formy zatrudnienia bierzesz pod uwagę?', description: 'Wybierz wszystkie pasujące opcje.' },
  { id: 'locations', title: 'W jakich lokalizacjach chcesz szukać pracy?', description: 'Dodaj miasta, regiony lub inne obszary wyszukiwania.' },
  { id: 'criteria', title: 'Jakie warunki są dla Ciebie ważne?', description: 'Dodaj must-have i warunki, których nie akceptujesz.', optional: true },
  { id: 'priorities', title: 'Co jest dla Ciebie najważniejsze przy ocenie oferty?', description: 'Ułóż cztery czynniki w kolejności ważności.' },
]

export function getProfileQuestions(draft: UserProfileDraft, currentProfile: UserProfile): ProfileQuestion[] {
  const questions: ProfileQuestion[] = []
  const roleIsCertain = draft.confidence.primaryRole === 'high' && Boolean(currentProfile.primaryRole.trim())
  if (!roleIsCertain) questions.push({ id: 'role', title: 'Jakiej roli szukasz przede wszystkim?', description: 'Potwierdź propozycję z CV albo wpisz swoją rolę docelową.' })
  if (!currentProfile.acceptedWorkModes.length) questions.push(preferenceQuestions[0])
  if (!currentProfile.acceptedContractTypes.length) questions.push(preferenceQuestions[1])
  if (!currentProfile.acceptedLocations.length) questions.push(preferenceQuestions[2])
  questions.push(preferenceQuestions[3], preferenceQuestions[4])
  return questions.slice(0, 6)
}

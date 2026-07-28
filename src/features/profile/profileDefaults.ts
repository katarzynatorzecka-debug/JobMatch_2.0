import type { UserProfile } from '../../contracts/profile'

export const defaultProfile: UserProfile = {
  primaryRole: '', alternativeRoles: [], experienceSummary: '', skills: [],
  acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false,
  excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false,
  additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'],
}

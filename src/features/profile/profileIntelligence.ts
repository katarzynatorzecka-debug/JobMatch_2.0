import type { ContractType, ProfileIntelligence, ProfilePriority, UserProfile, WorkMode } from '../../contracts/profile'

const priorityValues: ProfilePriority[] = ['experience', 'skills', 'preferences', 'growth']

function splitLegacy(value: string) { return value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean) }

export function emptyProfileIntelligence(): ProfileIntelligence {
  return {
    schemaVersion: 2,
    candidateFacts: { professionalSummary: '', totalExperienceYears: null, experienceAreas: [], skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] },
    careerTargets: { primaryRoles: [], alternativeRoles: [], targetSeniority: ['unknown'], careerDirections: [], transitionContext: null },
    workPreferences: { locations: [], workModes: [], employmentTypes: [], minimumSalary: null, availability: null, relocation: null },
    constraints: { mustHave: [], blacklist: [] },
    matchingPriorities: [...priorityValues],
  }
}

/** Reads legacy profiles without inventing facts. New V2 records remain canonical. */
export function profileIntelligenceFromLegacy(profile: UserProfile): ProfileIntelligence {
  if (profile.intelligence?.schemaVersion === 2) return profile.intelligence
  return {
    ...emptyProfileIntelligence(),
    candidateFacts: {
      ...emptyProfileIntelligence().candidateFacts,
      professionalSummary: profile.experienceSummary,
      skills: profile.skills.map((name) => ({ name, category: null, evidenceLevel: 'mentioned', yearsApprox: null, recency: 'unknown', evidence: [{ source: 'derived', text: 'Przeniesione z profilu V1.', section: null, userConfirmed: true }] })),
    },
    careerTargets: { primaryRoles: profile.primaryRole ? [profile.primaryRole] : [], alternativeRoles: profile.alternativeRoles, targetSeniority: ['unknown'], careerDirections: [], transitionContext: null },
    workPreferences: {
      locations: profile.acceptedLocations.map((value) => ({ value, isHard: false, source: 'user', userConfirmed: true })),
      workModes: profile.acceptedWorkModes.map((value) => ({ value, isHard: false, source: 'user', userConfirmed: true })),
      employmentTypes: profile.acceptedContractTypes.map((value) => ({ value, isHard: false, source: 'user', userConfirmed: true })),
      minimumSalary: profile.minimumSalary, availability: null, relocation: null,
    },
    constraints: { mustHave: splitLegacy(profile.additionalMustHave), blacklist: [...profile.excludedKeywords, ...splitLegacy(profile.additionalBlacklist)] },
    matchingPriorities: profile.priorities,
  }
}

/** Keeps the legacy fields as a compatibility projection for existing UI and repositories. */
export function applyProfileIntelligence(profile: UserProfile, intelligence: ProfileIntelligence): UserProfile {
  const primaryRole = intelligence.careerTargets.primaryRoles[0] ?? profile.primaryRole
  const soft = <T extends string>(items: Array<{ value: T; isHard: boolean }>) => items.map((item) => item.value)
  const hard = <T extends string>(items: Array<{ value: T; isHard: boolean }>) => items.filter((item) => item.isHard).map((item) => item.value)
  return {
    ...profile,
    primaryRole,
    alternativeRoles: intelligence.careerTargets.alternativeRoles,
    experienceSummary: intelligence.candidateFacts.professionalSummary,
    skills: profile.skills,
    acceptedLocations: soft(intelligence.workPreferences.locations),
    acceptedWorkModes: soft(intelligence.workPreferences.workModes) as WorkMode[],
    acceptedContractTypes: soft(intelligence.workPreferences.employmentTypes) as ContractType[],
    excludedWorkModes: hard(intelligence.workPreferences.workModes) as WorkMode[],
    excludedContractTypes: hard(intelligence.workPreferences.employmentTypes) as ContractType[],
    minimumSalary: intelligence.workPreferences.minimumSalary,
    additionalMustHave: intelligence.constraints.mustHave.join('\n'),
    additionalBlacklist: intelligence.constraints.blacklist.join('\n'),
    priorities: intelligence.matchingPriorities,
    intelligence,
  }
}

/** Manual fields always win over parser values before persistence. */
export function synchronizeProfileIntelligence(profile: UserProfile): UserProfile {
  const intelligence = profileIntelligenceFromLegacy(profile)
  intelligence.candidateFacts.professionalSummary = profile.experienceSummary
  intelligence.careerTargets.primaryRoles = profile.primaryRole ? [profile.primaryRole] : []
  intelligence.careerTargets.alternativeRoles = profile.alternativeRoles
  intelligence.constraints = { mustHave: splitLegacy(profile.additionalMustHave), blacklist: [...profile.excludedKeywords, ...splitLegacy(profile.additionalBlacklist)] }
  intelligence.matchingPriorities = profile.priorities
  const mergePreferences = <T extends string>(values: T[], existing: Array<{ value: T; isHard: boolean; source: 'cv' | 'user' | 'derived'; userConfirmed: boolean }>) => values.map((value) => existing.find((item) => item.value === value) ?? { value, isHard: false, source: 'user' as const, userConfirmed: true })
  intelligence.workPreferences.locations = mergePreferences(profile.acceptedLocations, intelligence.workPreferences.locations)
  intelligence.workPreferences.workModes = mergePreferences(profile.acceptedWorkModes, intelligence.workPreferences.workModes)
  intelligence.workPreferences.employmentTypes = mergePreferences(profile.acceptedContractTypes, intelligence.workPreferences.employmentTypes)
  intelligence.workPreferences.minimumSalary = profile.minimumSalary
  const existing = new Map(intelligence.candidateFacts.skills.map((skill) => [skill.name.toLocaleLowerCase(), skill]))
  intelligence.candidateFacts.skills = profile.skills.map((name) => existing.get(name.toLocaleLowerCase()) ?? { name, category: null, evidenceLevel: 'mentioned', yearsApprox: null, recency: 'unknown', evidence: [{ source: 'user', text: 'Dodane ręcznie przez użytkownika.', section: null, userConfirmed: true }] })
  return applyProfileIntelligence(profile, intelligence)
}

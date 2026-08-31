import type { ContractType, ProfileEvidence, ProfileIntelligence, ProfilePriority, UserProfile, WorkMode } from '../../contracts/profile'

const priorityValues: ProfilePriority[] = ['experience', 'skills', 'preferences', 'growth']

function splitLegacy(value: string) { return value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean) }

/** Removes direct contact data without turning evidence into a CV archive. */
export function sanitizeEvidenceText(value: string) {
  return value.trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail ukryty]')
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, '[telefon ukryty]')
    .replace(/(?:https?:\/\/|www\.)[^\s)]+/gi, '[adres ukryty]')
    .slice(0, 180)
}

export function sanitizeEvidence(items: ProfileEvidence[]) {
  return items.map((item) => ({ ...item, text: sanitizeEvidenceText(item.text) })).filter((item) => Boolean(item.text)).slice(0, 3)
}

const manualEvidence = (text: string): ProfileEvidence[] => [{ source: 'user', text: sanitizeEvidenceText(`Potwierdzone ręcznie: ${text}`), section: null, userConfirmed: true }]

export function emptyProfileIntelligence(): ProfileIntelligence {
  return {
    schemaVersion: 2,
    candidateFacts: { professionalSummary: '', totalExperienceYears: null, experienceEntries: [], experienceAreas: [], skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] },
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
      skills: profile.skills.map((name) => ({ name, category: null, evidenceLevel: 'mentioned', yearsApprox: null, recency: 'unknown', evidence: [{ source: 'derived', text: 'Przeniesione z profilu V1.', section: null, userConfirmed: true }], confidence: null, status: 'unknown' })),
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
    skills: intelligence.candidateFacts.skills.map((skill) => skill.name),
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
  const intelligence = structuredClone(profileIntelligenceFromLegacy(profile))
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
  const currentProjection = intelligence.candidateFacts.skills.map((skill) => skill.name)
  if (JSON.stringify(currentProjection.map((name) => name.toLocaleLowerCase()).sort()) !== JSON.stringify(profile.skills.map((name) => name.toLocaleLowerCase()).sort())) {
    intelligence.candidateFacts.skills = profile.skills.map((name) => {
      const previous = existing.get(name.toLocaleLowerCase())
      return previous ? { ...previous, evidence: sanitizeEvidence(previous.evidence) } : { name, category: null, evidenceLevel: 'mentioned', yearsApprox: null, recency: 'unknown', evidence: manualEvidence(name), confidence: null, status: 'unknown' as const }
    })
  }
  const sanitizeFacts = <T extends { evidence: ProfileEvidence[] }>(items: T[]) => items.map((item) => ({ ...item, evidence: sanitizeEvidence(item.evidence) }))
  intelligence.candidateFacts.skills = sanitizeFacts(intelligence.candidateFacts.skills)
  intelligence.candidateFacts.experienceAreas = sanitizeFacts(intelligence.candidateFacts.experienceAreas)
  intelligence.candidateFacts.responsibilities = sanitizeFacts(intelligence.candidateFacts.responsibilities)
  intelligence.candidateFacts.domains = sanitizeFacts(intelligence.candidateFacts.domains)
  intelligence.candidateFacts.achievements = sanitizeFacts(intelligence.candidateFacts.achievements)
  intelligence.candidateFacts.languages = sanitizeFacts(intelligence.candidateFacts.languages)
  intelligence.candidateFacts.education = sanitizeFacts(intelligence.candidateFacts.education)
  intelligence.candidateFacts.certifications = sanitizeFacts(intelligence.candidateFacts.certifications)
  intelligence.candidateFacts.experienceEntries = intelligence.candidateFacts.experienceEntries.map((entry) => ({ ...entry, evidence: sanitizeEvidence(entry.evidence), responsibilities: sanitizeFacts(entry.responsibilities), achievements: sanitizeFacts(entry.achievements), domains: sanitizeFacts(entry.domains) }))
  if (intelligence.candidateFacts.experienceEntries.length) {
    const unique = <T extends { evidence: ProfileEvidence[] }>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item).toLocaleLowerCase(), item])).values()]
    intelligence.candidateFacts.responsibilities = unique(intelligence.candidateFacts.experienceEntries.flatMap((entry) => entry.responsibilities), (item) => item.capability)
    intelligence.candidateFacts.achievements = unique(intelligence.candidateFacts.experienceEntries.flatMap((entry) => entry.achievements), (item) => item.capability)
    intelligence.candidateFacts.domains = unique(intelligence.candidateFacts.experienceEntries.flatMap((entry) => entry.domains), (item) => item.name)
  }
  return applyProfileIntelligence(profile, intelligence)
}

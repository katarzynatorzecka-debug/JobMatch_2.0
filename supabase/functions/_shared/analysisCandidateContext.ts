const limit = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const array = (value: unknown) => Array.isArray(value) ? value : []

/** Keeps candidate facts bounded and never promotes targets to experience. */
export function buildAnalysisCandidateContext(profile: Record<string, unknown>, _offerText: string) {
  const intelligence = profile.intelligence as Record<string, unknown> | undefined
  if (!intelligence || intelligence.schemaVersion !== 2) return {
    schemaVersion: 1,
    experience: [limit(profile.experienceSummary, 900)].filter(Boolean),
    skills: array(profile.skills).filter((value): value is string => typeof value === 'string').slice(0, 20),
    careerTargets: { primaryRoles: [limit(profile.primaryRole, 120)].filter(Boolean), alternativeRoles: array(profile.alternativeRoles).filter((value): value is string => typeof value === 'string').slice(0, 8) },
    workPreferences: { locations: array(profile.acceptedLocations).slice(0, 8), workModes: array(profile.acceptedWorkModes).slice(0, 3), employmentTypes: array(profile.acceptedContractTypes).slice(0, 5) },
    constraints: { mustHave: limit(profile.additionalMustHave, 500), blacklist: limit(profile.additionalBlacklist, 500) },
    priorities: array(profile.priorities).slice(0, 4),
  }
  const facts = intelligence.candidateFacts as Record<string, unknown> ?? {}
  const targets = intelligence.careerTargets as Record<string, unknown> ?? {}
  const preferences = intelligence.workPreferences as Record<string, unknown> ?? {}
  // Relevance cannot depend on literal token overlap: it silently removes
  // transferable experience (for example service delivery vs coordination).
  // Preserve a deterministic, bounded subset and let AI assess relevance.
  const pick = (key: string, nameKey: string, max: number) => array(facts[key]).filter((entry) => entry && typeof entry === 'object' && limit((entry as Record<string, unknown>)[nameKey], 160)).slice(0, max).map((entry) => {
    const raw = entry as Record<string, unknown>
    const evidence = array(raw.evidence).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).text, 180) : '').filter(Boolean).slice(0, 2)
    const evidenceItems = array(raw.evidence).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    return { name: limit(raw[nameKey], 160), evidenceLevel: limit(raw.evidenceLevel, 24) || null, recency: limit(raw.recency, 24) || null, evidence, source: limit(evidenceItems[0]?.source, 16) || null, userConfirmed: evidenceItems.some((item) => item.userConfirmed === true) }
  })
  const experienceEntries = array(facts.experienceEntries).filter((entry) => entry && typeof entry === 'object' && limit((entry as Record<string, unknown>).role, 160)).slice(0, 6).map((entry) => {
    const raw = entry as Record<string, unknown>
    const capabilities = array(raw.responsibilities).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).capability, 160) : '').filter(Boolean).slice(0, 6)
    const domains = array(raw.domains).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).name, 120) : '').filter(Boolean).slice(0, 4)
    const evidence = array(raw.evidence).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).text, 180) : '').filter(Boolean).slice(0, 2)
    return { role: limit(raw.role, 160), company: limit(raw.company, 120) || null, duration: limit(raw.duration, 80) || null, capabilities, domains, evidence, source: limit((array(raw.evidence)[0] as Record<string, unknown> | undefined)?.source, 16) || null, userConfirmed: array(raw.evidence).some((item) => item && typeof item === 'object' && (item as Record<string, unknown>).userConfirmed === true) }
  })
  const projects = array(facts.projects).filter((project) => project && typeof project === 'object' && limit((project as Record<string, unknown>).name, 160)).slice(0, 12).map((project) => {
    const raw = project as Record<string, unknown>
    const evidence = array(raw.evidence).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).text, 180) : '').filter(Boolean).slice(0, 3)
    return {
      name: limit(raw.name, 160), scope: limit(raw.scope, 500), role: limit(raw.role, 160),
      stack: array(raw.stack).map((item) => limit(item, 80)).filter(Boolean).slice(0, 20), result: limit(raw.result, 500),
      link: limit(raw.link, 240) || null, deployed: typeof raw.deployed === 'boolean' ? raw.deployed : null,
      uxEvidence: array(raw.uxEvidence).map((item) => limit(item, 300)).filter(Boolean).slice(0, 8), prototypingEvidence: array(raw.prototypingEvidence).map((item) => limit(item, 300)).filter(Boolean).slice(0, 8),
      evidence, source: limit((array(raw.evidence)[0] as Record<string, unknown> | undefined)?.source, 16) || null, userConfirmed: array(raw.evidence).some((item) => item && typeof item === 'object' && (item as Record<string, unknown>).userConfirmed === true),
    }
  })
  return {
    schemaVersion: 2,
    professionalSummary: limit(facts.professionalSummary, 900), totalExperienceYears: typeof facts.totalExperienceYears === 'number' ? facts.totalExperienceYears : null,
    experienceEntries, projects, experience: pick('experienceAreas', 'area', 8), skills: pick('skills', 'name', 20), capabilities: pick('responsibilities', 'capability', 12), domains: pick('domains', 'name', 8), achievements: pick('achievements', 'capability', 6), languages: pick('languages', 'name', 8), education: pick('education', 'name', 6), certifications: pick('certifications', 'name', 8),
    careerTargets: { primaryRoles: array(targets.primaryRoles).map((value) => limit(value, 120)).filter(Boolean).slice(0, 5), alternativeRoles: array(targets.alternativeRoles).map((value) => limit(value, 120)).filter(Boolean).slice(0, 8), directions: array(targets.careerDirections).map((value) => limit(value, 160)).filter(Boolean).slice(0, 6) },
    workPreferences: { locations: array(preferences.locations).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).value, 120) : limit(item, 120)).filter(Boolean).slice(0, 8), workModes: array(preferences.workModes).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).value, 40) : limit(item, 40)).filter(Boolean).slice(0, 3), employmentTypes: array(preferences.employmentTypes).map((item) => item && typeof item === 'object' ? limit((item as Record<string, unknown>).value, 40) : limit(item, 40)).filter(Boolean).slice(0, 5) },
    constraints: intelligence.constraints ?? {}, priorities: array(intelligence.matchingPriorities).slice(0, 4),
  }
}

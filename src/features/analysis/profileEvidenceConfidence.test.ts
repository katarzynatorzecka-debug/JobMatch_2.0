import { describe, expect, it } from 'vitest'
import { confidenceFromProfileEvidence, profileEvidenceConfidence } from './profileEvidenceConfidence'

describe('Profile Intelligence evidence confidence', () => {
  it('keeps a mentioned keyword below professional evidence and gives manual confirmation precedence', () => {
    expect(confidenceFromProfileEvidence([{ source: 'cv', text: 'Jira', section: 'skills', userConfirmed: false }], 'mentioned')).toBeLessThan(confidenceFromProfileEvidence([{ source: 'cv', text: 'Jira used in role', section: 'experience', userConfirmed: false }], 'professional'))
    expect(confidenceFromProfileEvidence([{ source: 'user', text: 'Potwierdzone ręcznie', section: null, userConfirmed: true }], 'professional')).toBeGreaterThan(90)
  })

  it('derives a bounded confidence ceiling from facts, never career targets', () => {
    const value = profileEvidenceConfidence({ intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: null, experienceAreas: [], skills: [{ name: 'Jira', category: null, evidenceLevel: 'mentioned', yearsApprox: null, recency: 'unknown', evidence: [{ source: 'cv', text: 'Jira', section: 'skills', userConfirmed: false }] }], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: ['Senior architect'], alternativeRoles: [], targetSeniority: ['senior'], careerDirections: [], transitionContext: null }, workPreferences: { locations: [], workModes: [], employmentTypes: [], minimumSalary: null, availability: null, relocation: null }, constraints: { mustHave: [], blacklist: [] }, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } })
    expect(value).toBeLessThan(70)
  })
})

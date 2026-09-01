import { describe, expect, it } from 'vitest'
import type { ProfileIntelligence } from '../../contracts/profile'
import { confidenceFromProfileEvidence, profileEvidenceConfidence } from './profileEvidenceConfidence'

describe('Profile Intelligence evidence confidence', () => {
  it('keeps a mentioned keyword below professional evidence and gives manual confirmation precedence', () => {
    expect(confidenceFromProfileEvidence([{ source: 'cv', text: 'Jira', section: 'skills', userConfirmed: false }], 'mentioned')).toBeLessThan(confidenceFromProfileEvidence([{ source: 'cv', text: 'Jira used in role', section: 'experience', userConfirmed: false }], 'professional'))
    expect(confidenceFromProfileEvidence([{ source: 'user', text: 'Potwierdzone ręcznie', section: null, userConfirmed: true }], 'professional')).toBeGreaterThan(90)
  })

  it('derives a bounded confidence ceiling from facts, never career targets', () => {
    const value = profileEvidenceConfidence({ intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: null, experienceEntries: [], experienceAreas: [], skills: [{ name: 'Jira', category: null, evidenceLevel: 'mentioned', yearsApprox: null, recency: 'unknown', evidence: [{ source: 'cv', text: 'Jira', section: 'skills', userConfirmed: false }] }], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: ['Senior architect'], alternativeRoles: [], targetSeniority: ['senior'], careerDirections: [], transitionContext: null }, workPreferences: { locations: [], workModes: [], employmentTypes: [], minimumSalary: null, availability: null, relocation: null }, constraints: { mustHave: [], blacklist: [] }, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } })
    expect(value).toBeLessThan(70)
  })

  it('uses confirmed structured experience as V2 evidence without treating a target as evidence', () => {
    const base: ProfileIntelligence = { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: null, experienceEntries: [], experienceAreas: [], skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: ['Director'], alternativeRoles: [], targetSeniority: ['senior'], careerDirections: [], transitionContext: null }, workPreferences: { locations: [], workModes: [], employmentTypes: [], minimumSalary: null, availability: null, relocation: null }, constraints: { mustHave: [], blacklist: [] }, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] }
    expect(profileEvidenceConfidence({ intelligence: base })).toBeNull()
    const value = profileEvidenceConfidence({ intelligence: { ...base, candidateFacts: { ...base.candidateFacts, experienceEntries: [{ role: 'Service Manager', company: null, startDate: null, endDate: null, duration: null, responsibilities: [], achievements: [], domains: [], evidence: [{ source: 'user', text: 'Potwierdzone doświadczenie.', section: 'experience', userConfirmed: true }] }] } } })
    expect(value).toBe(95)
  })
})

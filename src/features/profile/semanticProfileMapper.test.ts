import { describe, expect, it } from 'vitest'
import type { SemanticProfileMapping } from '../../schemas/profileSemanticSchemas'
import { semanticProfileMappingSchema } from '../../schemas/profileSemanticSchemas'
import { semanticMappingToDraft } from './semanticProfileMapper'

const unknown = <T extends string | string[]>(value: T) => ({ value, evidence: [], confidence: 0, status: 'unknown' as const })
const extracted = <T extends string | string[]>(value: T, evidence: string[]) => ({ value, evidence, confidence: .92, status: 'extracted' as const })
const inferred = <T extends string | string[]>(value: T, evidence: string[]) => ({ value, evidence, confidence: .62, status: 'inferred' as const })
const unknownNumber = { value: null, evidence: [], confidence: 0, status: 'unknown' as const }
const fact = <T extends object>(value: T) => ({ ...value, evidence: ['CV: potwierdzone'], confidence: .9, status: 'extracted' as const })
const candidateFacts = () => ({ totalExperienceYears: unknownNumber, experienceEntries: [fact({ role: 'Service Delivery Manager', company: 'Example Co', startDate: '2020', endDate: null, duration: null, responsibilities: [fact({ capability: 'Prowadzenie usług' })], achievements: [fact({ capability: 'Usprawniono raportowanie' })], domains: [fact({ name: 'IT operations', yearsApprox: 5 })] })], experienceAreas: [fact({ area: 'Service delivery', yearsApprox: 5, recency: 'recent' as const })], skills: [fact({ name: 'Jira', category: null, evidenceLevel: 'professional' as const, yearsApprox: 4, recency: 'recent' as const })], responsibilities: [fact({ capability: 'Prowadzenie usług' })], domains: [fact({ name: 'IT operations', yearsApprox: 5 })], achievements: [fact({ capability: 'Usprawniono raportowanie' })], languages: [fact({ name: 'Angielski', level: 'B2' })], education: [fact({ name: 'Zarządzanie', issuer: 'Uczelnia' })], certifications: [fact({ name: 'ITIL', issuer: 'AXELOS' })] })
const base = (): SemanticProfileMapping => ({
  fullName: extracted('Anna Example', ['Anna Example']),
  primaryRole: extracted('Service Delivery Manager', ['Service Delivery Manager']),
  alternativeRoles: extracted(['IT Service Manager'], ['IT Service Manager']),
  professionalSummary: extracted('Service delivery leader with experience in IT operations, stakeholder management and continuous improvement.', ['Experience in IT operations and stakeholder management.']),
  skills: extracted(['IT Service Management', 'Jira', 'Confluence'], ['Skills: IT Service Management, Jira, Confluence']),
  locations: unknown([]), workModes: unknown([]), contractTypes: unknown([]),
  candidateFacts: candidateFacts(),
})

describe('semanticMappingToDraft', () => {
  it('T1 maps a standard one-column CV response with evidenced core fields', () => {
    const draft = semanticMappingToDraft(base(), 'pasted-text')
    expect(draft.values.primaryRole).toBe('Service Delivery Manager')
    expect(draft.values.skills).toContain('Jira')
    expect(draft.presentation?.fullName).toBe('Anna Example')
    expect(draft.values.intelligence?.candidateFacts.experienceAreas[0]?.area).toBe('Service delivery')
    expect(draft.values.intelligence?.candidateFacts.domains[0]?.name).toBe('IT operations')
    expect(draft.values.intelligence?.candidateFacts.certifications[0]?.name).toBe('ITIL')
    expect(draft.values.intelligence?.candidateFacts.experienceEntries[0]?.role).toBe('Service Delivery Manager')
    expect(draft.values.intelligence?.candidateFacts.skills[0]?.status).toBe('extracted')
  })

  it('redacts direct contact data before it enters the canonical draft', () => {
    const mapping = base(); mapping.candidateFacts.skills[0]!.evidence = ['Contact: anna@example.com, +48 500 600 700']
    const draft = semanticMappingToDraft(mapping, 'pasted-text')
    const jira = draft.values.intelligence?.candidateFacts.skills.find((skill) => skill.name === 'Jira')
    expect(jira?.evidence[0]?.text).toContain('[e-mail ukryty]')
    expect(jira?.evidence[0]?.text).toContain('[telefon ukryty]')
  })

  it('T2 accepts a two-column reordered response without relying on source order', () => {
    const mapping = base(); mapping.skills = extracted(['Power BI', 'SQL', 'ServiceNow'], ['Expertise column: Power BI, SQL, ServiceNow'])
    const draft = semanticMappingToDraft(mapping, 'pasted-text')
    expect(draft.values.skills).toEqual(['Power BI', 'SQL', 'ServiceNow'])
  })

  it('T3 keeps non-standard About, Career Summary and Expertise output when it has evidence', () => {
    const mapping = base(); mapping.professionalSummary = extracted('Operations specialist improving service processes and reporting.', ['Career Summary: improving service processes and reporting.'])
    const draft = semanticMappingToDraft(mapping, 'pasted-text')
    expect(draft.values.experienceSummary).toContain('Operations specialist')
  })

  it('T4 leaves sparse CV fields unknown and empty', () => {
    const mapping = base(); mapping.alternativeRoles = unknown([]); mapping.skills = unknown([])
    const draft = semanticMappingToDraft(mapping, 'pasted-text')
    expect(draft.values.alternativeRoles).toEqual([])
    expect(draft.values.skills).toEqual([])
    expect(draft.confidence.skills).toBe('missing')
  })

  it('T5 keeps search preferences and hard constraints empty when CV does not explicitly state them', () => {
    const draft = semanticMappingToDraft(base(), 'pasted-text')
    expect(draft.values.acceptedLocations).toEqual([])
    expect(draft.values.acceptedWorkModes).toEqual([])
    expect(draft.values.acceptedContractTypes).toEqual([])
    expect(draft.values.additionalMustHave).toBe('')
    expect(draft.values.additionalBlacklist).toBe('')
    expect(draft.values.excludedKeywords).toEqual([])
    expect(draft.values.priorities).toEqual(['experience', 'skills', 'preferences', 'growth'])
  })

  it('creates a review draft without mutating an already saved profile before explicit Save', () => {
    const savedProfile = { primaryRole: 'Existing profile role', acceptedLocations: ['Kraków'], additionalMustHave: 'Existing constraint' }
    const snapshot = structuredClone(savedProfile)
    const draft = semanticMappingToDraft(base(), 'pasted-text')
    expect(savedProfile).toEqual(snapshot)
    expect(draft.values.primaryRole).toBe('Service Delivery Manager')
    expect(draft.values.additionalMustHave).toBe('')
  })

  it('rejects unsupported profile controls and recognised values without evidence', () => {
    const unsupported = { ...base(), additionalMustHave: 'Invented requirement' }
    expect(semanticProfileMappingSchema.safeParse(unsupported).success).toBe(false)
    const unsupportedEvidence = { ...base(), primaryRole: { ...base().primaryRole, evidence: [] } }
    expect(semanticProfileMappingSchema.safeParse(unsupportedEvidence).success).toBe(false)
  })

  it('reproduces the deployed V2 contract mismatch when candidateFacts are absent', () => {
    const legacyResponse = base() as Record<string, unknown>
    delete legacyResponse.candidateFacts
    expect(semanticProfileMappingSchema.safeParse(legacyResponse).success).toBe(false)
  })
})

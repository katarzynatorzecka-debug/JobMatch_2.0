import { describe, expect, it } from 'vitest'
import { isCvProfileOutput } from '../../../supabase/functions/_shared/cvProfileOutputSchema'
import edgeSource from '../../../supabase/functions/map-cv-profile/index.ts?raw'

const unknown = { value: '', evidence: [], confidence: 0, status: 'unknown' }
const mapping = {
  fullName: { value: 'Anna Example', evidence: ['Anna Example'], confidence: .98, status: 'extracted' },
  primaryRole: { value: 'Service Delivery Manager', evidence: ['Service Delivery Manager'], confidence: .95, status: 'extracted' },
  alternativeRoles: { value: ['IT Service Manager'], evidence: ['IT Service Manager'], confidence: .8, status: 'inferred' },
  professionalSummary: { value: 'Experienced service delivery professional focused on IT operations and stakeholder management.', evidence: ['Experience in IT operations and stakeholder management.'], confidence: .9, status: 'extracted' },
  skills: { value: ['Jira', 'Confluence'], evidence: ['Skills: Jira, Confluence'], confidence: .9, status: 'extracted' },
  locations: { value: [], evidence: [], confidence: 0, status: 'unknown' },
  workModes: { value: [], evidence: [], confidence: 0, status: 'unknown' },
  contractTypes: { value: [], evidence: [], confidence: 0, status: 'unknown' },
  candidateFacts: {
    totalExperienceYears: { value: null, evidence: [], confidence: 0, status: 'unknown' },
    experienceEntries: [],
    experienceAreas: [{ area: 'Service delivery', yearsApprox: 5, recency: 'recent', evidence: ['Experience in service delivery'], confidence: .9, status: 'extracted' }],
    skills: [{ name: 'Jira', category: null, evidenceLevel: 'professional', yearsApprox: 3, recency: 'recent', evidence: ['Jira used in role'], confidence: .9, status: 'extracted' }],
    responsibilities: [{ capability: 'Stakeholder management', evidence: ['Stakeholder management'], confidence: .9, status: 'extracted' }],
    domains: [{ name: 'IT operations', yearsApprox: 5, evidence: ['IT operations'], confidence: .9, status: 'extracted' }],
    achievements: [], languages: [], education: [], certifications: [],
  },
}

describe('CV profile Edge output contract', () => {
  it('accepts an evidenced structured mapping and unknown empty fields', () => {
    expect(isCvProfileOutput(mapping)).toBe(true)
  })

  it('rejects a recognised field without evidence', () => {
    expect(isCvProfileOutput({ ...mapping, primaryRole: { ...mapping.primaryRole, evidence: [] } })).toBe(false)
  })

  it('keeps private CV text out of logs and requires an authenticated caller', () => {
    expect(edgeSource).toContain("if (!authorization) return failure('AUTH_REQUIRED', 401)")
    expect(edgeSource).toContain("const text = typeof body.text === 'string' ? body.text.trim() : ''")
    expect(edgeSource).not.toMatch(/console\.(?:log|info)\([^\n]*(?:text|prompt)/)
  })
})

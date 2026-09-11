import { describe, expect, it } from 'vitest'
import { defaultProfile } from './profileDefaults'
import { profileIntelligenceFromLegacy, sanitizeEvidenceText, synchronizeProfileIntelligence } from './profileIntelligence'

describe('Profile Intelligence canonicalization', () => {
  it('keeps V1 skills as mentioned and never turns a legacy role into employment history', () => {
    const intelligence = profileIntelligenceFromLegacy({ ...defaultProfile, primaryRole: 'Delivery Manager', skills: ['Jira'] })
    expect(intelligence.candidateFacts.experienceEntries).toEqual([])
    expect(intelligence.candidateFacts.skills[0]?.evidenceLevel).toBe('mentioned')
    expect(intelligence.candidateFacts.skills[0]?.evidence[0]?.source).toBe('derived')
  })

  it('uses V2 skills as the source of truth and derives the legacy list on save', () => {
    const profile = { ...defaultProfile, skills: ['Old skill'] }
    const intelligence = profileIntelligenceFromLegacy(profile)
    intelligence.candidateFacts.skills = [{ name: 'ServiceNow', category: null, evidenceLevel: 'professional', yearsApprox: 3, recency: 'recent', evidence: [{ source: 'cv', text: 'Used ServiceNow in operations.', section: 'experience', userConfirmed: false }], confidence: .9, status: 'extracted' }]
    const saved = synchronizeProfileIntelligence({ ...profile, intelligence, skills: ['ServiceNow'] })
    expect(saved.skills).toEqual(['ServiceNow'])
    expect(saved.intelligence?.candidateFacts.skills[0]?.evidenceLevel).toBe('professional')
  })

  it('derives flattened capabilities from canonical experience entries', () => {
    const intelligence = profileIntelligenceFromLegacy(defaultProfile)
    intelligence.candidateFacts.experienceEntries = [{ role: 'Operations Lead', company: null, startDate: null, endDate: null, duration: null, evidence: [{ source: 'user', text: 'Operations Lead', section: null, userConfirmed: true }], responsibilities: [{ capability: 'Stakeholder management', evidence: [{ source: 'user', text: 'Stakeholder management', section: null, userConfirmed: true }] }], achievements: [], domains: [{ name: 'IT operations', yearsApprox: null, evidence: [{ source: 'user', text: 'IT operations', section: null, userConfirmed: true }] }] }]
    const saved = synchronizeProfileIntelligence({ ...defaultProfile, intelligence })
    expect(saved.intelligence?.candidateFacts.responsibilities.map((item) => item.capability)).toEqual(['Stakeholder management'])
    expect(saved.intelligence?.candidateFacts.domains.map((item) => item.name)).toEqual(['IT operations'])
  })

  it('redacts contact PII while retaining professional text', () => {
    expect(sanitizeEvidenceText('Delivery lead, anna@example.com, +48 500 600 700, https://linkedin.example/a')).toBe('Delivery lead, [e-mail ukryty], [telefon ukryty], [adres ukryty]')
  })
})

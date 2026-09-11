import { describe, expect, it } from 'vitest'
import { buildAnalysisCandidateContext } from '../../../supabase/functions/_shared/analysisCandidateContext'

describe('AnalysisCandidateContext', () => {
  it('bounds facts, excludes raw CV and keeps career targets separate from experience', () => {
    const profile = { intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: 'x'.repeat(2_000), totalExperienceYears: 8, experienceEntries: [], experienceAreas: Array.from({ length: 20 }, (_, index) => ({ area: `automation ${index}`, evidence: [{ text: 'e'.repeat(300), source: 'cv', userConfirmed: false }] })), skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: ['Target role only'], alternativeRoles: [], careerDirections: [] }, workPreferences: { locations: [{ value: 'Warszawa', isHard: false }], workModes: [], employmentTypes: [] }, constraints: {}, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } }
    const context = buildAnalysisCandidateContext(profile, 'Oferta automation w Warszawie') as Record<string, unknown>
    expect(JSON.stringify(context)).not.toContain('x'.repeat(901))
    expect((context.experience as unknown[]).length).toBeLessThanOrEqual(8)
    expect(context.careerTargets).toEqual(expect.objectContaining({ primaryRoles: ['Target role only'] }))
    expect(context.experience).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Target role only' })]))
    expect((context.workPreferences as Record<string, unknown>).locations).toEqual(['Warszawa'])
  })

  it('uses structured professional experience but never promotes a target role into it', () => {
    const profile = { intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: 4, experienceEntries: [{ role: 'Automation Specialist', company: 'Example', duration: '2022-2026', responsibilities: [{ capability: 'Service delivery', evidence: [] }], domains: [{ name: 'IT operations', evidence: [] }], evidence: [{ text: 'Automation and service delivery.', source: 'cv', userConfirmed: false }] }], experienceAreas: [], skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: ['Data Scientist'], alternativeRoles: [], careerDirections: [] }, workPreferences: { locations: [], workModes: [], employmentTypes: [] }, constraints: {}, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } }
    const context = buildAnalysisCandidateContext(profile, 'Oferta Automation Specialist') as Record<string, unknown>
    expect(context.experienceEntries).toEqual([expect.objectContaining({ role: 'Automation Specialist', capabilities: ['Service delivery'] })])
    expect(JSON.stringify(context.experienceEntries)).not.toContain('Data Scientist')
  })

  it('keeps bounded transferable facts even when they share no literal token with the offer', () => {
    const profile = { intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: 6, experienceEntries: [{ role: 'Service Delivery Manager', company: 'Example', duration: '2020-2026', responsibilities: [], domains: [], evidence: [{ text: 'Service delivery.', source: 'cv', userConfirmed: false }] }], experienceAreas: [], skills: [{ name: 'Stakeholder management', evidenceLevel: 'professional', evidence: [{ text: 'Stakeholder management.', source: 'cv', userConfirmed: false }] }], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: [], alternativeRoles: [], careerDirections: [] }, workPreferences: { locations: [], workModes: [], employmentTypes: [] }, constraints: {}, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } }
    const context = buildAnalysisCandidateContext(profile, 'Oferta koordynacji operacyjnej') as Record<string, unknown>
    expect(context.experienceEntries).toEqual([expect.objectContaining({ role: 'Service Delivery Manager' })])
    expect(context.skills).toEqual([expect.objectContaining({ name: 'Stakeholder management' })])
  })

  it('passes first-class project evidence to assessment without leaking unbounded fields', () => {
    const profile = { intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: 3, experienceEntries: [], projects: [{ name: 'JobMatchMaker', scope: 'End-to-end web application', role: 'Product builder', stack: ['OpenAI API', 'Codex', 'React', 'TypeScript'], result: 'Deployed working product', link: 'https://example.com', deployed: true, uxEvidence: ['Interactive user flows'], prototypingEvidence: ['Rapid clickable prototype'], evidence: [{ source: 'cv', text: 'JobMatchMaker: end-to-end application', userConfirmed: false }] }], experienceAreas: [], skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: [], alternativeRoles: [], careerDirections: [] }, workPreferences: { locations: [], workModes: [], employmentTypes: [] }, constraints: {}, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } }
    const context = buildAnalysisCandidateContext(profile, 'AI prototype builder') as Record<string, unknown>
    expect(context.projects).toEqual([expect.objectContaining({ name: 'JobMatchMaker', role: 'Product builder', stack: expect.arrayContaining(['Codex']), deployed: true, uxEvidence: ['Interactive user flows'] })])
  })
})

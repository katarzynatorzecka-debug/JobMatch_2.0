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
})

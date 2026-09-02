import { describe, expect, it } from 'vitest'
import type { ProfilePriority } from '../../contracts/profile'
import { calculateCriterionLevelScore, calculateDeterministicScore } from './deterministicScoring'

const allMatch = { experience: 'MATCH', skills: 'MATCH', preferences: 'MATCH', growth: 'MATCH' } as const

describe('deterministic scoring', () => {
  it('maps MATCH, PARTIAL and NO_MATCH to 100, 60 and 0 with the approved weights', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { experience: 'MATCH', skills: 'PARTIAL', preferences: 'NO_MATCH', growth: 'MATCH' })
    expect(result.scoring.weights).toEqual({ experience: 35, skills: 30, preferences: 20, growth: 15 })
    expect(result.overallScore).toBe(68)
  })

  it('keeps UNKNOWN outside score and reports the uncovered weight as coverage', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { ...allMatch, growth: 'UNKNOWN' }, { experience: 80, skills: 80, preferences: 80 })
    expect(result.overallScore).toBe(100)
    expect(result.scoring.coverage).toBe(85)
    expect(result.scoring.reliability).toBe('standard')
    expect(result.categoryScores.growth).toBeNull()
  })

  it('changes weights when the profile priority order changes', () => {
    const result = calculateDeterministicScore({ priorities: ['growth', 'experience', 'skills', 'preferences'] }, { experience: 'NO_MATCH', skills: 'NO_MATCH', preferences: 'NO_MATCH', growth: 'MATCH' })
    expect(result.scoring.weights.growth).toBe(35)
    expect(result.overallScore).toBe(35)
  })

  it('aggregates confidence only from scored criteria and guards a high recommendation with reliability', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, allMatch, { experience: 55, skills: 55, preferences: 55, growth: 55 })
    expect(result.scoring.criterionConfidence).toBe(55)
    expect(result.scoring.reliability).toBe('limited')
    expect(result.recommendation).toBe('Wymaga sprawdzenia')
  })

  it('rejects an invalid priority order instead of silently assigning fallback weights', () => {
    expect(() => calculateDeterministicScore({ priorities: ['experience', 'experience', 'skills', 'growth'] }, allMatch)).toThrow('PROFILE_PRIORITIES_INVALID')
  })

  it('calculates coverage from subcriteria without penalizing known matches for unknown criteria', () => {
    let index = 0; const criterion = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN', confidence = 80) => ({ id: `req:${outcome.toLocaleLowerCase()}-${++index}`, requirement: outcome, outcome, rationale: outcome, profileEvidence: outcome === 'UNKNOWN' ? [] : ['profil'], offerEvidence: outcome === 'UNKNOWN' ? [] : ['oferta'], confidence })
    const result = calculateCriterionLevelScore({ priorities: ['preferences', 'growth', 'skills', 'experience'] }, { preferences: [criterion('MATCH')], growth: [criterion('UNKNOWN')], skills: [criterion('MATCH')], experience: [criterion('MATCH')] })
    expect(result.overallScore).toBe(100)
    expect(result.scoring.coverage).toBe(70)
    expect(result.scoring.reliability).toBe('limited')
    expect(result.scoring.unknownCriterionCount).toBe(1)
    expect(result.recommendation).toBe('Wymaga sprawdzenia')
  })

  it('rejects duplicate canonical requirements instead of selecting the most optimistic outcome', () => {
    const base = { requirement: 'Znajomość SQL', outcome: 'MATCH' as const, rationale: 'Potwierdzone.', profileEvidence: ['SQL w doświadczeniu.'], offerEvidence: ['SQL wymagany.'], confidence: 80, canonicalKey: 'req:sql' }
    expect(() => calculateCriterionLevelScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, {
      experience: [{ ...base, id: 'req:sql-experience' }, { ...base, id: 'req:sql-skill', outcome: 'PARTIAL' as const, profileEvidence: ['SQL w projekcie.'] }],
      skills: [{ ...base, id: 'req:communication', canonicalKey: 'req:communication', requirement: 'Komunikacja' }],
      preferences: [{ ...base, id: 'req:location', canonicalKey: 'req:location', requirement: 'Lokalizacja' }],
      growth: [{ ...base, id: 'req:growth', canonicalKey: 'req:growth', requirement: 'Rozwój' }],
    })).toThrow('ANALYSIS_CRITERION_DUPLICATE:req:sql')
  })

  it('calibrates five representative offer shapes before runtime provider calls', () => {
    let index = 0; const criterion = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN', confidence = 80) => ({ id: `req:${outcome.toLocaleLowerCase()}-${confidence}-${++index}`, requirement: 'wymóg', outcome, rationale: 'uzasadnienie', profileEvidence: outcome === 'UNKNOWN' ? [] : ['profil'], offerEvidence: outcome === 'UNKNOWN' ? [] : ['oferta'], confidence })
    const profile = { priorities: ['experience', 'skills', 'preferences', 'growth'] as ProfilePriority[] }
    const all = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN') => ({ experience: [criterion(outcome)], skills: [criterion(outcome)], preferences: [criterion(outcome)], growth: [criterion(outcome)] })
    expect(calculateCriterionLevelScore(profile, all('MATCH')).recommendation).toBe('Warto aplikować')
    expect(calculateCriterionLevelScore(profile, { ...all('MATCH'), skills: [criterion('PARTIAL')] }).overallScore).toBe(88)
    const incomplete = calculateCriterionLevelScore(profile, { ...all('MATCH'), skills: [criterion('UNKNOWN')], growth: [criterion('UNKNOWN')] })
    expect(incomplete.scoring.coverage).toBe(55)
    expect(incomplete.scoring.reliability).toBe('limited')
    expect(incomplete.recommendation).toBe('Wymaga sprawdzenia')
    expect(calculateCriterionLevelScore(profile, all('NO_MATCH')).recommendation).toBe('Nie rekomenduję')
    expect(calculateCriterionLevelScore(profile, { experience: [criterion('MATCH')], skills: [criterion('MATCH'), criterion('UNKNOWN')], preferences: [criterion('MATCH')], growth: [criterion('UNKNOWN')] }).scoring.coverage).toBe(70)
  })

  it('calibrates the Systems & Automation Specialist report with neutral UNKNOWN values', () => {
    let sequence = 0
    const criterion = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN') => ({ id: `req:${outcome.toLocaleLowerCase()}-${++sequence}`, requirement: outcome, outcome, rationale: outcome, profileEvidence: outcome === 'UNKNOWN' ? [] : ['profil'], offerEvidence: outcome === 'UNKNOWN' ? [] : ['oferta'], confidence: 80 })
    const result = calculateCriterionLevelScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, {
      experience: [criterion('MATCH'), criterion('PARTIAL'), criterion('PARTIAL')],
      skills: [criterion('MATCH'), criterion('MATCH'), criterion('MATCH'), criterion('PARTIAL'), criterion('UNKNOWN'), criterion('UNKNOWN')],
      preferences: [criterion('MATCH'), criterion('MATCH'), criterion('PARTIAL'), criterion('NO_MATCH'), criterion('UNKNOWN'), criterion('UNKNOWN')],
      growth: [criterion('MATCH'), criterion('PARTIAL'), criterion('UNKNOWN'), criterion('UNKNOWN')],
    })
    expect(result.overallScore).toBe(77)
    expect(result.scoring.coverage).toBe(76)
    expect(result.categoryScores).toEqual({ experience: 73, skills: 90, preferences: 65, growth: 80 })
    expect(result.scoring.reliability).toBe('standard')
    expect(result.recommendation).toBe('Warto aplikować')
  })
})

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

  it('keeps UNKNOWN outside Hard Filter semantics but lowers the score by uncovered weight', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { ...allMatch, growth: 'UNKNOWN' }, { experience: 80, skills: 80, preferences: 80 })
    expect(result.overallScore).toBe(85)
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

  it('calculates coverage from subcriteria and prevents a perfect score with unknown criteria', () => {
    const criterion = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN', confidence = 80) => ({ id: outcome, requirement: outcome, outcome, rationale: outcome, profileEvidence: outcome === 'UNKNOWN' ? [] : ['profil'], offerEvidence: outcome === 'UNKNOWN' ? [] : ['oferta'], confidence })
    const result = calculateCriterionLevelScore({ priorities: ['preferences', 'growth', 'skills', 'experience'] }, { preferences: [criterion('MATCH')], growth: [criterion('UNKNOWN')], skills: [criterion('MATCH')], experience: [criterion('MATCH')] })
    expect(result.overallScore).toBe(70)
    expect(result.scoring.coverage).toBe(70)
    expect(result.scoring.reliability).toBe('limited')
    expect(result.scoring.unknownCriterionCount).toBe(1)
    expect(result.recommendation).toBe('Wymaga sprawdzenia')
  })

  it('calibrates five representative offer shapes before runtime provider calls', () => {
    const criterion = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN', confidence = 80) => ({ id: `${outcome}-${confidence}`, requirement: 'wymóg', outcome, rationale: 'uzasadnienie', profileEvidence: outcome === 'UNKNOWN' ? [] : ['profil'], offerEvidence: outcome === 'UNKNOWN' ? [] : ['oferta'], confidence })
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
})

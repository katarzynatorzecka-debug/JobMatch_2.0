import { describe, expect, it } from 'vitest'
import { calculateDeterministicScore } from './deterministicScoring'

const allMatch = { experience: 'MATCH', skills: 'MATCH', preferences: 'MATCH', growth: 'MATCH' } as const

describe('deterministic scoring', () => {
  it('maps MATCH, PARTIAL and NO_MATCH to 100, 60 and 0 with the approved weights', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { experience: 'MATCH', skills: 'PARTIAL', preferences: 'NO_MATCH', growth: 'MATCH' })
    expect(result.scoring.weights).toEqual({ experience: 35, skills: 30, preferences: 20, growth: 15 })
    expect(result.overallScore).toBe(68)
  })

  it('keeps UNKNOWN outside the score and reports reduced coverage', () => {
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
})

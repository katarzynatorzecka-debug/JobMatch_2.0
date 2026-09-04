import { describe, expect, it } from 'vitest'
import type { ProfilePriority } from '../../contracts/profile'
import { buildScoringCalibrationReport, scoringWeightVariants } from '../../../supabase/functions/_shared/scoringCalibration'
import { calculateCriterionLevelScore, calculateDeterministicScore } from './deterministicScoring'

const allMatch = { experience: 'MATCH', skills: 'MATCH', preferences: 'MATCH', growth: 'MATCH' } as const

describe('deterministic scoring', () => {
  it('uses an explicit employer-fit 80/user-compatibility 20 budget', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { experience: 'MATCH', skills: 'PARTIAL', preferences: 'NO_MATCH', growth: 'MATCH' })
    expect(result.scoring.weights).toEqual({ employerFit: 80, userCompatibility: 20 })
    expect(result.scoring.variantId).toBe('critical-priority')
    expect(result.scoring.calibrationStatus).toBe('pending_human_scoring_gate')
    expect(result.scoring.employerFitScore).toBe(87)
    expect(result.scoring.userCompatibilityScore).toBe(0)
    expect(result.overallScore).toBe(69)
  })

  it('keeps UNKNOWN in the denominator instead of inflating the score', () => {
    const result = calculateDeterministicScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { ...allMatch, growth: 'UNKNOWN' }, { experience: 80, skills: 80, preferences: 80 })
    expect(result.overallScore).toBe(73)
    expect(result.scoring.coverage).toBe(73)
    expect(result.scoring.reliability).toBe('limited')
    expect(result.categoryScores.growth).toBeNull()
  })

  it('does not let profile category order replace the 80/20 dimension contract', () => {
    const result = calculateDeterministicScore({ priorities: ['growth', 'experience', 'skills', 'preferences'] }, { experience: 'NO_MATCH', skills: 'NO_MATCH', preferences: 'NO_MATCH', growth: 'MATCH' })
    expect(result.scoring.weights).toEqual({ employerFit: 80, userCompatibility: 20 })
    expect(result.overallScore).toBe(27)
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
    expect(result.overallScore).toBe(73)
    expect(result.scoring.coverage).toBe(73)
    expect(result.scoring.reliability).toBe('limited')
    expect(result.scoring.unknownCriterionCount).toBe(1)
    expect(result.recommendation).toBe('Wymaga sprawdzenia')
  })

  it('scores a clear unsupported requirement as NO_MATCH instead of removing it from coverage', () => {
    const unsupported = { id: 'req:arabic-native', canonicalKey: 'req:arabic-native', requirement: 'Język arabski na poziomie native', outcome: 'NO_MATCH' as const, rationale: 'Profil nie zawiera potwierdzenia tego wymagania.', profileEvidence: [], offerEvidence: ['Arabic native required.'], confidence: 92 }
    const result = calculateCriterionLevelScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { experience: [], skills: [unsupported], preferences: [], growth: [] })
    expect(result.overallScore).toBe(0)
    expect(result.scoring.coverage).toBe(100)
    expect(result.scoring.criterionConfidence).toBe(92)
    expect(result.scoring.unknownCriterionCount).toBe(0)
  })

  it('rejects positive or partial classifications without criterion-level profile evidence', () => {
    const unsupportedPartial = { id: 'req:moderation', canonicalKey: 'req:moderation', requirement: 'Doświadczenie w moderacji', outcome: 'PARTIAL' as const, rationale: 'Częściowe dopasowanie.', profileEvidence: [], offerEvidence: ['Moderation experience required.'], confidence: 70 }
    expect(() => calculateCriterionLevelScore({ priorities: ['experience', 'skills', 'preferences', 'growth'] }, { experience: [unsupportedPartial], skills: [], preferences: [], growth: [] })).toThrow('ANALYSIS_CRITERION_PROFILE_EVIDENCE_REQUIRED:req:moderation')
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
    expect(calculateCriterionLevelScore(profile, { ...all('MATCH'), skills: [criterion('PARTIAL')] }).overallScore).toBe(89)
    const incomplete = calculateCriterionLevelScore(profile, { ...all('MATCH'), skills: [criterion('UNKNOWN')], growth: [criterion('UNKNOWN')] })
    expect(incomplete.scoring.coverage).toBe(47)
    expect(incomplete.scoring.reliability).toBe('limited')
    expect(incomplete.recommendation).toBe('Wymaga sprawdzenia')
    expect(calculateCriterionLevelScore(profile, all('NO_MATCH')).recommendation).toBe('Nie rekomenduję')
    expect(calculateCriterionLevelScore(profile, { experience: [criterion('MATCH')], skills: [criterion('MATCH'), criterion('UNKNOWN')], preferences: [criterion('MATCH')], growth: [criterion('UNKNOWN')] }).scoring.coverage).toBe(60)
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
    expect(result.overallScore).toBe(54)
    expect(result.scoring.coverage).toBe(69)
    expect(result.categoryScores).toEqual({ experience: 73, skills: 60, preferences: 43, growth: 40 })
    expect(result.scoring.reliability).toBe('limited')
    expect(result.recommendation).toBe('Wymaga sprawdzenia')
  })

  it('produces a calibration report for three non-final importance variants', () => {
    let index = 0
    const criterion = (outcome: 'MATCH' | 'PARTIAL' | 'NO_MATCH' | 'UNKNOWN', importance: 'critical' | 'core' | 'preferred', type: 'required_skill' | 'employment_condition' = 'required_skill') => ({ id: `req:calibration-${++index}`, canonicalKey: `req:calibration-${index}`, requirement: 'wymóg', type, importance, outcome, rationale: outcome, profileEvidence: outcome === 'UNKNOWN' || outcome === 'NO_MATCH' ? [] : ['profil'], offerEvidence: ['oferta'], confidence: 80 })
    const report = buildScoringCalibrationReport(['experience', 'skills', 'preferences', 'growth'], [{
      id: 'critical-must-have',
      criteria: { experience: [criterion('NO_MATCH', 'critical')], skills: [criterion('MATCH', 'preferred'), criterion('MATCH', 'preferred'), criterion('MATCH', 'preferred')], preferences: [criterion('MATCH', 'preferred', 'employment_condition')], growth: [] },
    }])
    expect(scoringWeightVariants).toHaveLength(3)
    expect(report.status).toBe('pending_human_scoring_gate')
    expect(report.activeVariantId).toBe('critical-priority')
    expect(report.cases[0].variants).toHaveLength(3)
    expect(report.cases[0].variants[1].overallScore).toBeLessThan(report.cases[0].variants[0].overallScore)
    expect(report.cases[0].variants[2].overallScore).toBeLessThan(report.cases[0].variants[1].overallScore)
  })
})

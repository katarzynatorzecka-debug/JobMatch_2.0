import { describe, expect, it } from 'vitest'
import type { UserProfile } from '../contracts/profile'
import { normalizeProfile, userProfileDraftSchema, validateUserProfile } from './profileSchemas'

const validProfile: UserProfile = {
  primaryRole: 'Process Specialist', alternativeRoles: ['Operations Analyst'], experienceSummary: 'Buduję uporządkowane procesy operacyjne i raportowanie dla zespołów.', skills: ['SQL', 'Power BI'],
  acceptedWorkModes: ['remote'], acceptedContractTypes: ['employment'], acceptedLocations: ['Warszawa'], minimumSalary: null, studentStatusAvailable: false,
  excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'],
}

describe('UserProfile schema', () => {
  it('accepts a realistic profile', () => expect(validateUserProfile(validProfile).success).toBe(true))
  it('rejects an empty primary role', () => expect(validateUserProfile({ ...validProfile, primaryRole: '' }).success).toBe(false))
  it('rejects an empty skills list', () => expect(validateUserProfile({ ...validProfile, skills: [] }).success).toBe(false))
  it('rejects invalid or duplicate priorities', () => {
    expect(validateUserProfile({ ...validProfile, priorities: ['experience', 'experience', 'skills', 'growth'] }).success).toBe(false)
    expect(validateUserProfile({ ...validProfile, priorities: ['experience', 'skills', 'growth'] }).success).toBe(false)
  })
  it('normalizes blank list elements and still catches normalized duplicates', () => {
    expect(normalizeProfile({ ...validProfile, alternativeRoles: [' Operations Analyst ', ' ', 'Data Analyst'] }).alternativeRoles).toEqual(['Operations Analyst', 'Data Analyst'])
    expect(validateUserProfile({ ...validProfile, skills: [' SQL ', '', 'sql'] }).success).toBe(false)
  })
})

describe('UserProfileDraft schema', () => {
  it('accepts incomplete extracted values with confidence', () => {
    const result = userProfileDraftSchema.safeParse({ values: { ...validProfile, primaryRole: '', experienceSummary: '', skills: [] }, confidence: { primaryRole: 'missing', alternativeRoles: 'missing', experienceSummary: 'missing', skills: 'missing' }, warnings: ['Brak danych.'], source: 'pasted-text', requiresAcceptance: true })
    expect(result.success).toBe(true)
  })
  it('rejects malformed confidence', () => {
    const result = userProfileDraftSchema.safeParse({ values: validProfile, confidence: { primaryRole: 'certain' }, warnings: [], source: 'pdf', requiresAcceptance: true })
    expect(result.success).toBe(false)
  })
})

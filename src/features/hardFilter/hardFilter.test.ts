import { describe, expect, it } from 'vitest'
import type { ImportedJobOffer } from '../../contracts/import'
import type { UserProfile } from '../../contracts/profile'
import { evaluateOffer, evaluateOffers } from './hardFilter'

const profile: UserProfile = { primaryRole: 'Analyst', alternativeRoles: [], experienceSummary: 'Analizuję dane i usprawniam procesy biznesowe w zespołach.', skills: ['SQL'], acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'] }
function offer(overrides: Partial<ImportedJobOffer> = {}): ImportedJobOffer { return { id: 'offer-example-1', title: 'Data Analyst', company: 'Example', location: 'Warszawa', workMode: 'Praca zdalna', contractType: 'Umowa B2B', salary: '120 PLN/h', sourceLabel: 'RocketJobs', missingFields: [], warnings: [], ...overrides } }

describe('Hard Filter', () => {
  it('returns PASS for a complete offer without conflicts', () => expect(evaluateOffer(profile, offer()).status).toBe('pass'))
  it('returns FAIL for an excluded contract', () => expect(evaluateOffer({ ...profile, excludedContractTypes: ['b2b'] }, offer()).status).toBe('fail'))
  it('returns FAIL for an excluded work mode', () => expect(evaluateOffer({ ...profile, excludedWorkModes: ['remote'] }, offer()).status).toBe('fail'))
  it('returns FAIL for a matching excluded keyword', () => expect(evaluateOffer({ ...profile, excludedKeywords: ['analyst'] }, offer()).status).toBe('fail'))
  it('returns FAIL for an explicit student requirement when profile does not confirm it', () => expect(evaluateOffer({ ...profile, requiresStudentStatus: true }, offer({ title: 'Student Data Analyst' })).status).toBe('fail'))
  it('returns WEAK, not FAIL, when contract is missing', () => expect(evaluateOffer(profile, offer({ contractType: undefined })).status).toBe('weak'))
  it('returns WEAK when work mode is missing', () => expect(evaluateOffer(profile, offer({ workMode: undefined })).status).toBe('weak'))
  it('keeps a missing soft location neutral in Hard Filter', () => expect(evaluateOffer(profile, offer({ location: undefined })).status).toBe('pass'))
  it('keeps V2 preferences neutral until the user explicitly promotes one to hard', () => {
    const soft: UserProfile = { ...profile, intelligence: { schemaVersion: 2, candidateFacts: { professionalSummary: '', totalExperienceYears: null, experienceEntries: [], experienceAreas: [], skills: [], responsibilities: [], domains: [], achievements: [], languages: [], education: [], certifications: [] }, careerTargets: { primaryRoles: [], alternativeRoles: [], targetSeniority: ['unknown'], careerDirections: [], transitionContext: null }, workPreferences: { locations: [{ value: 'Kraków', isHard: false, source: 'user', userConfirmed: true }], workModes: [], employmentTypes: [], minimumSalary: null, availability: null, relocation: null }, constraints: { mustHave: [], blacklist: [] }, matchingPriorities: ['experience', 'skills', 'preferences', 'growth'] } }
    expect(evaluateOffer(soft, offer()).status).toBe('pass')
    const intelligence = soft.intelligence!
    expect(evaluateOffer({ ...soft, intelligence: { ...intelligence, workPreferences: { ...intelligence.workPreferences, locations: [{ ...intelligence.workPreferences.locations[0], isHard: true }] } } }, offer()).status).toBe('fail')
  })
  it('keeps several reasons and gives FAIL priority over WEAK', () => { const result = evaluateOffer({ ...profile, excludedContractTypes: ['b2b'] }, offer({ workMode: undefined })); expect(result.status).toBe('fail'); expect(result.reasons.map((reason) => reason.code)).toEqual(['excluded-contract', 'missing-work-mode']) })
  it('does not duplicate normalized keyword reasons', () => { const result = evaluateOffer({ ...profile, excludedKeywords: ['analyst', ' ANALYST '] }, offer()); expect(result.reasons.filter((reason) => reason.code.startsWith('excluded-keyword:'))).toHaveLength(1) })
  it('uses profile criteria rather than hardcoded user keywords', () => { expect(evaluateOffer({ ...profile, excludedKeywords: ['finance'] }, offer()).status).toBe('pass'); expect(evaluateOffer({ ...profile, excludedKeywords: ['analyst'] }, offer()).status).toBe('fail') })
  it('preserves input order in evaluateOffers', () => { const first = offer({ id: 'offer-first', title: 'First role' }); const second = offer({ id: 'offer-second', title: 'Second role' }); expect(evaluateOffers(profile, [first, second]).map((item) => item.offer.id)).toEqual(['offer-first', 'offer-second']) })
  it('keeps must-have uncertainty as WEAK rather than confirmed conflict', () => expect(evaluateOffer({ ...profile, additionalMustHave: 'Power BI' }, offer()).status).toBe('weak'))
})

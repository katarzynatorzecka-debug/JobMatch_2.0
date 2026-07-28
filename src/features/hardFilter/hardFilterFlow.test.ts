import { describe, expect, it } from 'vitest'
import type { ImportedJobOffer } from '../../contracts/import'
import type { UserProfile } from '../../contracts/profile'
import { evaluateOffers } from './hardFilter'
import { loadHardFilterSession, saveHardFilterSession } from './hardFilterSessionStorage'

function memoryStorage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }
const profile: UserProfile = { primaryRole: 'Analyst', alternativeRoles: [], experienceSummary: 'Analizuję dane i procesy w zespołach operacyjnych.', skills: ['SQL'], acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: ['internship'], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'] }
const offers: ImportedJobOffer[] = [{ id: 'offer-pass-1', title: 'Data Analyst', company: 'Example', location: 'Warszawa', workMode: 'Zdalnie', contractType: 'B2B', missingFields: [], warnings: [] }, { id: 'offer-fail-1', title: 'Intern Analyst', company: 'Example', location: 'Warszawa', workMode: 'Zdalnie', contractType: 'Praktyka', missingFields: [], warnings: [] }]

describe('Hard Filter flow', () => {
  it('maps imported offers to validated cross-route results without demo data', () => { const filteredOffers = evaluateOffers(profile, offers); const storage = memoryStorage(); expect(saveHardFilterSession({ version: 1, filteredOffers }, storage)).toBe(true); const stored = loadHardFilterSession(storage).session; expect(stored?.filteredOffers.map((item) => item.offer.id)).toEqual(['offer-pass-1', 'offer-fail-1']); expect(stored?.filteredOffers.map((item) => item.result.status)).toEqual(['pass', 'fail']) })
})

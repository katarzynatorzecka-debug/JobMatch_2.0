import { describe, expect, it } from 'vitest'
import type { UserProfile } from '../../contracts/profile'
import { loadUserProfile, PROFILE_STORAGE_KEY, saveUserProfile } from './profileStorage'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }
}
const profile: UserProfile = { primaryRole: 'Service Specialist', alternativeRoles: [], experienceSummary: 'Koordynuję usługi i usprawniam codzienną współpracę zespołów.', skills: ['Jira'], acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'] }

describe('profileStorage', () => {
  it('saves and reads a valid profile', () => { const storage = memoryStorage(); expect(saveUserProfile(profile, storage).success).toBe(true); expect(loadUserProfile(storage).profile).toEqual(profile) })
  it('returns null without data', () => expect(loadUserProfile(memoryStorage()).profile).toBeNull())
  it('drops malformed JSON safely', () => { const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: '{broken' }); expect(loadUserProfile(storage).profile).toBeNull(); expect(storage.getItem(PROFILE_STORAGE_KEY)).toBeNull() })
  it('drops schema-invalid storage safely', () => { const storage = memoryStorage({ [PROFILE_STORAGE_KEY]: JSON.stringify({ primaryRole: '' }) }); expect(loadUserProfile(storage).profile).toBeNull(); expect(storage.getItem(PROFILE_STORAGE_KEY)).toBeNull() })
})

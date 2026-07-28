import { describe, expect, it } from 'vitest'
import type { HardFilterSession } from '../../contracts/hardFilter'
import { HARD_FILTER_SESSION_STORAGE_KEY, loadHardFilterSession, saveHardFilterSession } from './hardFilterSessionStorage'

function memoryStorage(initial: Record<string, string> = {}) { const values = new Map(Object.entries(initial)); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }
const session: HardFilterSession = { version: 1, filteredOffers: [{ offer: { id: 'offer-example-1', title: 'Data Analyst', company: 'Example', missingFields: [], warnings: [] }, result: { offerId: 'offer-example-1', status: 'weak', reasons: [{ code: 'missing-contract', label: 'Brak informacji o rodzaju umowy.', category: 'contract' }], missingInformation: ['rodzaj umowy'], checkedCriteria: ['Typ umowy'] } }] }

describe('hardFilterSessionStorage', () => {
  it('saves and reads a validated session', () => { const storage = memoryStorage(); expect(saveHardFilterSession(session, storage)).toBe(true); expect(loadHardFilterSession(storage).session).toEqual(session) })
  it('clears malformed and invalid session data', () => { const broken = memoryStorage({ [HARD_FILTER_SESSION_STORAGE_KEY]: '{broken' }); expect(loadHardFilterSession(broken).session).toBeNull(); expect(broken.getItem(HARD_FILTER_SESSION_STORAGE_KEY)).toBeNull(); const invalid = memoryStorage({ [HARD_FILTER_SESSION_STORAGE_KEY]: JSON.stringify({ version: 1, filteredOffers: [{}] }) }); expect(loadHardFilterSession(invalid).session).toBeNull(); expect(invalid.getItem(HARD_FILTER_SESSION_STORAGE_KEY)).toBeNull() })
})

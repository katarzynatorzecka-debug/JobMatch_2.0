import type { HardFilterSession } from '../../contracts/hardFilter'
import { validateHardFilterSession } from '../../schemas/hardFilterSchemas'

export const HARD_FILTER_SESSION_STORAGE_KEY = 'jobmatch.hard-filter-session.v1'
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | null { return typeof window === 'undefined' ? null : window.sessionStorage }

export function loadHardFilterSession(storage: StorageLike | null = browserStorage()) {
  if (!storage) return { session: null as HardFilterSession | null }
  try {
    const raw = storage.getItem(HARD_FILTER_SESSION_STORAGE_KEY)
    if (!raw) return { session: null as HardFilterSession | null }
    const result = validateHardFilterSession(JSON.parse(raw))
    if (result.success) return { session: result.data }
    storage.removeItem(HARD_FILTER_SESSION_STORAGE_KEY)
    return { session: null as HardFilterSession | null, warning: 'Wyczyściliśmy nieprawidłowy wynik Hard Filter.' }
  } catch {
    try { storage.removeItem(HARD_FILTER_SESSION_STORAGE_KEY) } catch { /* unavailable storage */ }
    return { session: null as HardFilterSession | null, warning: 'Nie udało się odczytać wyniku Hard Filter.' }
  }
}

export function saveHardFilterSession(session: HardFilterSession, storage: StorageLike | null = browserStorage()) {
  const result = validateHardFilterSession(session)
  if (!result.success || !storage) return false
  try { storage.setItem(HARD_FILTER_SESSION_STORAGE_KEY, JSON.stringify(result.data)); return true } catch { return false }
}

export function clearHardFilterSession(storage: StorageLike | null = browserStorage()) { try { storage?.removeItem(HARD_FILTER_SESSION_STORAGE_KEY) } catch { /* unavailable storage */ } }

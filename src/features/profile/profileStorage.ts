import type { UserProfile } from '../../contracts/profile'
import { validateUserProfile } from '../../schemas/profileSchemas'

export const PROFILE_STORAGE_KEY = 'jobmatch.user-profile.v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ProfileLoadResult = { profile: UserProfile | null; warning?: string }

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function loadUserProfile(storage: StorageLike | null = browserStorage()): ProfileLoadResult {
  if (!storage) return { profile: null }
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return { profile: null }
    const result = validateUserProfile(JSON.parse(raw))
    if (result.success) return { profile: result.data }
    storage.removeItem(PROFILE_STORAGE_KEY)
    return { profile: null, warning: 'Zapisany profil miał nieprawidłowy format i został pominięty.' }
  } catch {
    try { storage.removeItem(PROFILE_STORAGE_KEY) } catch { /* storage can be unavailable */ }
    return { profile: null, warning: 'Nie udało się odczytać zapisanego profilu.' }
  }
}

export function saveUserProfile(profile: UserProfile, storage: StorageLike | null = browserStorage()) {
  const result = validateUserProfile(profile)
  if (!result.success) return result
  if (!storage) return { success: false as const, error: 'LocalStorage jest niedostępny.' }
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(result.data))
    return { success: true as const, data: result.data }
  } catch {
    return { success: false as const, error: 'Nie udało się zapisać profilu lokalnie.' }
  }
}

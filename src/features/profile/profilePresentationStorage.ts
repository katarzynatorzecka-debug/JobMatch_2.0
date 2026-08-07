import type { ProfilePresentationMetadata, ProfilePresentationSource } from '../../contracts/profilePresentation'
import { emptyProfilePresentation, profilePresentationSources } from '../../contracts/profilePresentation'

export const PROFILE_PRESENTATION_STORAGE_KEY = 'jobmatch.profile-presentation.v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type PresentationLoadResult = { presentation: ProfilePresentationMetadata; warning?: string }

const browserStorage = (): StorageLike | null => typeof window === 'undefined' ? null : window.localStorage

export function normalizeProfilePresentation(input: Partial<ProfilePresentationMetadata> | null | undefined): ProfilePresentationMetadata {
  const fullName = typeof input?.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
  const source: ProfilePresentationSource = profilePresentationSources.includes(input?.source as ProfilePresentationSource) ? input!.source as ProfilePresentationSource : 'none'
  return { fullName: fullName || null, source: fullName ? source === 'none' ? 'manual' : source : 'none' }
}

export function loadProfilePresentation(storage: StorageLike | null = browserStorage()): PresentationLoadResult {
  if (!storage) return { presentation: emptyProfilePresentation }
  try {
    const raw = storage.getItem(PROFILE_PRESENTATION_STORAGE_KEY)
    if (!raw) return { presentation: emptyProfilePresentation }
    const parsed = JSON.parse(raw) as Partial<ProfilePresentationMetadata>
    return { presentation: normalizeProfilePresentation(parsed) }
  } catch {
    try { storage.removeItem(PROFILE_PRESENTATION_STORAGE_KEY) } catch { /* storage can be unavailable */ }
    return { presentation: emptyProfilePresentation, warning: 'Nie udało się odczytać danych prezentacyjnych profilu.' }
  }
}

export function saveProfilePresentation(presentation: ProfilePresentationMetadata, storage: StorageLike | null = browserStorage()) {
  if (!storage) return { success: false as const, error: 'LocalStorage jest niedostępny.' }
  try {
    const normalized = normalizeProfilePresentation(presentation)
    storage.setItem(PROFILE_PRESENTATION_STORAGE_KEY, JSON.stringify(normalized))
    return { success: true as const, data: normalized }
  } catch {
    return { success: false as const, error: 'Nie udało się zapisać danych prezentacyjnych profilu.' }
  }
}

export function clearProfilePresentation(storage: StorageLike | null = browserStorage()) {
  try { storage?.removeItem(PROFILE_PRESENTATION_STORAGE_KEY); return true } catch { return false }
}
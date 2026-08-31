import type { UserProfileDraft } from '../../contracts/profile'
import { userProfileDraftSchema } from '../../schemas/profileSchemas'

const STORAGE_PREFIX = 'jobmatch.pending-profile-review.v1:'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type PendingProfileDraftLoadResult = { draft: UserProfileDraft | null; warning?: string }

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

export function pendingProfileDraftKey(scope: string) {
  return `${STORAGE_PREFIX}${scope}`
}

/**
 * Keeps only the review data in the current browser tab. It never stores the
 * PDF or the extracted CV text, and is cleared after save/restart/new CV.
 */
export function savePendingProfileDraft(draft: UserProfileDraft, scope: string, storage: StorageLike | null = browserStorage()) {
  if (!storage) return false
  const parsed = userProfileDraftSchema.safeParse({ ...draft, provenance: undefined })
  if (!parsed.success) return false
  try {
    storage.setItem(pendingProfileDraftKey(scope), JSON.stringify(parsed.data))
    return true
  } catch {
    return false
  }
}

export function loadPendingProfileDraft(scope: string, storage: StorageLike | null = browserStorage()): PendingProfileDraftLoadResult {
  if (!storage) return { draft: null }
  const key = pendingProfileDraftKey(scope)
  try {
    const raw = storage.getItem(key)
    if (!raw) return { draft: null }
    const parsed = userProfileDraftSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return { draft: parsed.data }
    storage.removeItem(key)
    return { draft: null, warning: 'Niezapisany szkic profilu miał nieprawidłowy format i został pominięty.' }
  } catch {
    try { storage.removeItem(key) } catch { /* sessionStorage can be unavailable */ }
    return { draft: null, warning: 'Nie udało się odczytać niezapisanego szkicu profilu.' }
  }
}

export function clearPendingProfileDraft(scope: string, storage: StorageLike | null = browserStorage()) {
  if (!storage) return
  try { storage.removeItem(pendingProfileDraftKey(scope)) } catch { /* sessionStorage can be unavailable */ }
}

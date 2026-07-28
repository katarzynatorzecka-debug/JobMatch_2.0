import type { ImportedReport } from '../../contracts/import'
import { validateImportedReport } from '../../schemas/importSchemas'

export const IMPORT_SESSION_STORAGE_KEY = 'jobmatch.import-session.v1'
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

export function loadImportedReport(storage: StorageLike | null = browserStorage()) {
  if (!storage) return { report: null as ImportedReport | null }
  try {
    const raw = storage.getItem(IMPORT_SESSION_STORAGE_KEY)
    if (!raw) return { report: null as ImportedReport | null }
    const result = validateImportedReport(JSON.parse(raw))
    if (result.success) return { report: result.data }
    storage.removeItem(IMPORT_SESSION_STORAGE_KEY)
    return { report: null as ImportedReport | null, warning: 'Wyczyściliśmy nieprawidłowy zapis importu.' }
  } catch {
    try { storage.removeItem(IMPORT_SESSION_STORAGE_KEY) } catch { /* unavailable storage */ }
    return { report: null as ImportedReport | null, warning: 'Nie udało się odczytać zapisanego importu.' }
  }
}

export function saveImportedReport(report: ImportedReport, storage: StorageLike | null = browserStorage()) {
  const result = validateImportedReport(report)
  if (!result.success || !storage) return false
  try { storage.setItem(IMPORT_SESSION_STORAGE_KEY, JSON.stringify(result.data)); return true } catch { return false }
}

export function clearImportedReport(storage: StorageLike | null = browserStorage()) {
  try { storage?.removeItem(IMPORT_SESSION_STORAGE_KEY) } catch { /* unavailable storage */ }
}

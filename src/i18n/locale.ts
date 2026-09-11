export const SUPPORTED_LOCALES = ['pl', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'pl'
export const LOCALE_STORAGE_KEY = 'jobmatch.locale.v1'

export type LocaleStorage = Pick<Storage, 'getItem' | 'setItem'>
export type DocumentLanguageTarget = { lang: string }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale)
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

function browserLocaleStorage(): LocaleStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadLocale(storage: LocaleStorage | null = browserLocaleStorage()): Locale {
  if (!storage) return DEFAULT_LOCALE
  try {
    return resolveLocale(storage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return DEFAULT_LOCALE
  }
}

export function saveLocale(locale: Locale, storage: LocaleStorage | null = browserLocaleStorage()): void {
  if (!storage) return
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Language selection remains usable even when browser storage is unavailable.
  }
}

export function applyDocumentLocale(
  locale: Locale,
  target: DocumentLanguageTarget | null = typeof document === 'undefined' ? null : document.documentElement,
): void {
  if (target) target.lang = locale
}

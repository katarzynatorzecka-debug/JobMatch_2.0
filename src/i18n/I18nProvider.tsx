import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { applyDocumentLocale, loadLocale, saveLocale, type Locale } from './locale'
import { enTranslations } from './translations/en'
import { plTranslations } from './translations/pl'
import {
  interpolateTranslation,
  type Translate,
  type TranslationKey,
  type TranslationParameters,
  type TranslationPrimitive,
} from './translationTypes'

const dictionaries = {
  pl: plTranslations,
  en: enTranslations,
}

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function translate<Key extends TranslationKey>(
  locale: Locale,
  key: Key,
  ...parameters: TranslationParameters[Key] extends undefined
    ? []
    : [parameters: TranslationParameters[Key]]
): string {
  return interpolateTranslation(
    dictionaries[locale][key],
    parameters[0] as Record<string, TranslationPrimitive> | undefined,
  )
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? loadLocale())

  useEffect(() => {
    saveLocale(locale)
    applyDocumentLocale(locale)
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    saveLocale(nextLocale)
    applyDocumentLocale(nextLocale)
    setLocaleState(nextLocale)
  }, [])

  const t = useCallback<Translate>((key, ...parameters) => (
    translate(locale, key, ...parameters as never)
  ), [locale])

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}

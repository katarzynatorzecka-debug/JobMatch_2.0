import { useI18n } from '../i18n/I18nProvider'
import type { Locale } from '../i18n/locale'

const localeOptions: Array<{ locale: Locale; shortLabel: string; nameKey: 'language.toggle.polish' | 'language.toggle.english' }> = [
  { locale: 'pl', shortLabel: 'PL', nameKey: 'language.toggle.polish' },
  { locale: 'en', shortLabel: 'EN', nameKey: 'language.toggle.english' },
]

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div className="language-toggle" role="group" aria-label={t('language.toggle.label')}>
      {localeOptions.map((option, index) => {
        const active = locale === option.locale
        const language = t(option.nameKey)
        return (
          <span className="language-toggle__segment" key={option.locale}>
            {index > 0 && <span className="language-toggle__separator" aria-hidden="true">|</span>}
            <button
              type="button"
              className={`language-toggle__option${active ? ' language-toggle__option--active' : ''}`}
              aria-label={active
                ? t('language.toggle.current', { language })
                : t('language.toggle.switchTo', { language })}
              aria-pressed={active}
              onClick={() => setLocale(option.locale)}
            >
              {option.shortLabel}
            </button>
          </span>
        )
      })}
    </div>
  )
}

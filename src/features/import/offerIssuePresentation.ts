function clean(value: string) {
  return value.replace(/^(brakuje|brak danych)\s*:\s*/i, '').replace(/[.!]+$/g, '').trim()
}
function key(value: string) { return clean(value).toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() }
function sameFact(first: string, second: string) {
  const a = key(first); const b = key(second)
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const [aWord] = a.split(' '); const [bWord] = b.split(' ')
  return Boolean(aWord && bWord && aWord.length >= 6 && bWord.length >= 6 && (aWord.startsWith(bWord.slice(0, 6)) || bWord.startsWith(aWord.slice(0, 6))))
}

/** One user-facing issue per fact, even when a parser produced both a missing field and a warning. */
function issueFactLabel(value: string, locale: Locale) {
  const normalized = key(value)
  if (normalized === 'lokalizacja' || normalized === 'location') return translate(locale, 'domain.issue.location')
  if (normalized === 'tryb pracy' || normalized === 'work mode') return translate(locale, 'domain.issue.workMode')
  if (normalized === 'forma wspolpracy' || normalized === 'rodzaj umowy' || normalized === 'contract type') return translate(locale, 'domain.issue.contract')
  if (normalized === 'wynagrodzenie' || normalized === 'salary') return translate(locale, 'domain.issue.salary')
  return clean(value)
}

export function presentOfferIssues(input: { missingFields: string[]; warnings: string[] }, locale: Locale = 'pl') {
  const missing = [...new Set(input.missingFields.map(clean).filter(Boolean))]
  const warnings = input.warnings.flatMap((warning) => clean(warning).split(/[,;]+/).map((item) => item.trim()).filter(Boolean))
    .filter((warning, index, all) => !missing.some((item) => sameFact(item, warning)) && !all.slice(0, index).some((item) => sameFact(item, warning)))
  return { missing: missing.map((item) => issueFactLabel(item, locale)), warnings: warnings.map((item) => issueFactLabel(item, locale)) }
}

export function importWarningLabel(warning: ImportWarning, locale: Locale = 'pl') {
  if (warning.code === 'unsupported-layout') return translate(locale, 'domain.import.unsupportedLayout')
  if (warning.code === 'duplicate') {
    const offer = warning.message.replace(/^Pominięto zduplikowaną ofertę:\s*/i, '').replace(/[.!]+$/g, '').trim()
    return translate(locale, 'domain.import.duplicate', { offer: offer || warning.offerId || '?' })
  }
  return warning.message
}

const importFileErrorKeys = {
  'Wybierz plik raportu.': 'import.file.error.select',
  'Wybierz plik w formacie .eml.': 'import.file.error.extension',
  'Ten typ pliku nie wygląda jak wiadomość EML.': 'import.file.error.type',
  'Wybrany plik jest pusty.': 'import.file.error.empty',
  'Plik jest zbyt duży. Maksymalny rozmiar to 10 MB.': 'import.file.error.tooLarge',
  'Nie znaleziono treści raportu w pliku EML.': 'import.file.error.noContent',
  'Nie udało się odczytać tego pliku EML.': 'import.file.error.read',
} as const

export function importFileErrorLabel(message: string, locale: Locale = 'pl') {
  const key = importFileErrorKeys[message as keyof typeof importFileErrorKeys]
  return key ? translate(locale, key) : message
}
import type { ImportWarning } from '../../contracts/import'
import { translate } from '../../i18n/I18nProvider'
import type { Locale } from '../../i18n/locale'

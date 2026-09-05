import { describe, expect, it } from 'vitest'
import {
  applyDocumentLocale,
  DEFAULT_LOCALE,
  loadLocale,
  LOCALE_STORAGE_KEY,
  saveLocale,
  type LocaleStorage,
} from './locale'

function memoryStorage(initial?: string): LocaleStorage {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(LOCALE_STORAGE_KEY, initial)
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('locale persistence', () => {
  it('uses Polish by default', () => {
    expect(loadLocale(memoryStorage())).toBe(DEFAULT_LOCALE)
    expect(DEFAULT_LOCALE).toBe('pl')
  })

  it('restores remembered English on the next load', () => {
    const storage = memoryStorage()
    saveLocale('en', storage)
    expect(loadLocale(storage)).toBe('en')
  })

  it('falls back to Polish for an unsupported stored value', () => {
    expect(loadLocale(memoryStorage('de'))).toBe('pl')
  })

  it('updates the document language', () => {
    const root = { lang: 'pl' }
    applyDocumentLocale('en', root)
    expect(root.lang).toBe('en')
  })
})

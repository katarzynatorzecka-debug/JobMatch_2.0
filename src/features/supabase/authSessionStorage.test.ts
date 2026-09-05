import { describe, expect, it } from 'vitest'
import { clearAuthSessionPersistence, createAuthSessionStorage, isAuthSessionRemembered, setRememberedAuthSession } from './authSessionStorage'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function setup() {
  const stores = { local: new MemoryStorage(), session: new MemoryStorage() }
  return { stores, storage: createAuthSessionStorage(stores) }
}

describe('auth session storage', () => {
  it('stores sessions in session storage by default and removes a legacy persistent value', () => {
    const { stores, storage } = setup()
    stores.local.setItem('auth-token', 'legacy-session')

    expect(storage.getItem('auth-token')).toBeNull()
    storage.setItem('auth-token', 'browser-session')

    expect(stores.session.getItem('auth-token')).toBe('browser-session')
    expect(stores.local.getItem('auth-token')).toBeNull()
  })

  it('stores sessions persistently only after remember me is selected', () => {
    const { stores, storage } = setup()
    setRememberedAuthSession(true, stores)
    storage.setItem('auth-token', 'remembered-session')

    expect(isAuthSessionRemembered(stores)).toBe(true)
    expect(stores.local.getItem('auth-token')).toBe('remembered-session')
    expect(stores.session.getItem('auth-token')).toBeNull()
    expect(storage.getItem('auth-token')).toBe('remembered-session')
  })

  it('clears the session from both stores and resets the remembered preference', () => {
    const { stores, storage } = setup()
    setRememberedAuthSession(true, stores)
    stores.local.setItem('auth-token', 'local-session')
    stores.session.setItem('auth-token', 'tab-session')

    storage.removeItem('auth-token')
    clearAuthSessionPersistence(stores)

    expect(stores.local.getItem('auth-token')).toBeNull()
    expect(stores.session.getItem('auth-token')).toBeNull()
    expect(isAuthSessionRemembered(stores)).toBe(false)
  })
})

type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type AuthStoragePair = {
  local: AuthStorage
  session: AuthStorage
}

const AUTH_PERSISTENCE_KEY = 'jobmatch.auth-persistence.v1'
const REMEMBERED_VALUE = 'remembered'

function browserStoragePair(): AuthStoragePair | null {
  if (typeof window === 'undefined') return null
  return { local: window.localStorage, session: window.sessionStorage }
}

function isRemembered({ local }: AuthStoragePair) {
  try {
    return local.getItem(AUTH_PERSISTENCE_KEY) === REMEMBERED_VALUE
  } catch {
    return false
  }
}

export function createAuthSessionStorage(stores: AuthStoragePair) {
  return {
    getItem(key: string) {
      if (isRemembered(stores)) {
        try { return stores.local.getItem(key) } catch { return null }
      }

      let value: string | null = null
      try { value = stores.session.getItem(key) } catch { /* storage can be unavailable */ }
      try { stores.local.removeItem(key) } catch { /* discard legacy persistent sessions when possible */ }
      return value
    },
    setItem(key: string, value: string) {
      if (isRemembered(stores)) {
        stores.local.setItem(key, value)
        try { stores.session.removeItem(key) } catch { /* storage can be unavailable */ }
        return
      }

      stores.session.setItem(key, value)
      try { stores.local.removeItem(key) } catch { /* storage can be unavailable */ }
    },
    removeItem(key: string) {
      try { stores.local.removeItem(key) } catch { /* storage can be unavailable */ }
      try { stores.session.removeItem(key) } catch { /* storage can be unavailable */ }
    },
  }
}

export function setRememberedAuthSession(remember: boolean, stores = browserStoragePair()) {
  if (!stores) return
  try {
    if (remember) stores.local.setItem(AUTH_PERSISTENCE_KEY, REMEMBERED_VALUE)
    else stores.local.removeItem(AUTH_PERSISTENCE_KEY)
  } catch {
    // Supabase will surface a storage failure while saving the session.
  }
}

export function isAuthSessionRemembered(stores = browserStoragePair()) {
  return stores ? isRemembered(stores) : false
}

export function clearAuthSessionPersistence(stores = browserStoragePair()) {
  if (!stores) return
  try { stores.local.removeItem(AUTH_PERSISTENCE_KEY) } catch { /* storage can be unavailable */ }
}

const stores = browserStoragePair()
export const authSessionStorage = stores ? createAuthSessionStorage(stores) : undefined

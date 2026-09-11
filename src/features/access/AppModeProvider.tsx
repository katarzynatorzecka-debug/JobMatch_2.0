import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearIntegratedAnalysisSession } from '../analysis/integratedAnalysisSession'
import { supabase, supabaseConfigured } from '../supabase/client'
import { clearAuthSessionPersistence } from '../supabase/authSessionStorage'

export type AppMode = 'authenticated' | 'demo'
type AppModeState = { mode: AppMode | null; session: Session | null; loading: boolean; configured: boolean; enterDemo: () => void; exitDemo: () => void; signOut: () => Promise<void>; signOutEverywhere: () => Promise<void> }
const AppModeContext = createContext<AppModeState | null>(null)
const DEMO_KEY = 'jobmatch.app-mode.v1'
const AUTH_BOOTSTRAP_TIMEOUT_MS = 1500

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode | null>(null); const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!supabase) { setMode(sessionStorage.getItem(DEMO_KEY) === 'demo' ? 'demo' : null); setLoading(false); return }
    let active = true
    let bootstrapped = false
    const finishBootstrap = (nextSession: Session | null) => {
      if (!active || bootstrapped) return
      bootstrapped = true
      setSession(nextSession)
      setMode(nextSession ? 'authenticated' : sessionStorage.getItem(DEMO_KEY) === 'demo' ? 'demo' : null)
      setLoading(false)
    }
    const timeout = window.setTimeout(() => finishBootstrap(null), AUTH_BOOTSTRAP_TIMEOUT_MS)
    void supabase.auth.getSession()
      .then(({ data }) => finishBootstrap(data.session))
      .catch(() => finishBootstrap(null))
      .finally(() => window.clearTimeout(timeout))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) { sessionStorage.removeItem(DEMO_KEY); setMode('authenticated') } else setMode(sessionStorage.getItem(DEMO_KEY) === 'demo' ? 'demo' : null)
      setLoading(false)
    })
    return () => { active = false; window.clearTimeout(timeout); data.subscription.unsubscribe() }
  }, [])
  const value = useMemo(() => {
    async function signOutWithScope(scope: 'local' | 'global') {
      if (!supabase) throw new Error('AUTH_NOT_CONFIGURED')
      const { error } = await supabase.auth.signOut({ scope })
      if (error) throw error
      clearAuthSessionPersistence()
      sessionStorage.removeItem(DEMO_KEY)
      setSession(null)
      setMode(null)
    }

    return {
      mode,
      session,
      loading,
      configured: supabaseConfigured,
      enterDemo: () => { sessionStorage.setItem(DEMO_KEY, 'demo'); setMode('demo') },
      exitDemo: () => { clearIntegratedAnalysisSession(undefined, 'demo'); sessionStorage.removeItem(DEMO_KEY); setMode(null) },
      signOut: () => signOutWithScope('local'),
      signOutEverywhere: () => signOutWithScope('global'),
    }
  }, [mode, session, loading])
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}
export function useAppMode() { const value = useContext(AppModeContext); if (!value) throw new Error('AppModeProvider is required'); return value }

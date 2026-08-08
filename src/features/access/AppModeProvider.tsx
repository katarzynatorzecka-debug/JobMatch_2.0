import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearIntegratedAnalysisSession } from '../analysis/integratedAnalysisSession'
import { supabase, supabaseConfigured } from '../supabase/client'

export type AppMode = 'authenticated' | 'demo'
type AppModeState = { mode: AppMode | null; session: Session | null; loading: boolean; configured: boolean; enterDemo: () => void; exitDemo: () => void; signOut: () => Promise<void> }
const AppModeContext = createContext<AppModeState | null>(null)
const DEMO_KEY = 'jobmatch.app-mode.v1'

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode | null>(null); const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { if (!supabase) { setMode(sessionStorage.getItem(DEMO_KEY) === 'demo' ? 'demo' : null); setLoading(false); return } ; supabase.auth.getSession().then(({ data }) => { setSession(data.session); setMode(data.session ? 'authenticated' : sessionStorage.getItem(DEMO_KEY) === 'demo' ? 'demo' : null); setLoading(false) }); const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) { sessionStorage.removeItem(DEMO_KEY); setMode('authenticated') } else setMode(sessionStorage.getItem(DEMO_KEY) === 'demo' ? 'demo' : null) }); return () => data.subscription.unsubscribe() }, [])
  const value = useMemo(() => ({ mode, session, loading, configured: supabaseConfigured, enterDemo: () => { sessionStorage.setItem(DEMO_KEY, 'demo'); setMode('demo') }, exitDemo: () => { clearIntegratedAnalysisSession(undefined, 'demo'); sessionStorage.removeItem(DEMO_KEY); setMode(null) }, signOut: async () => {
    try { await supabase?.auth.signOut({ scope: 'local' }) }
    finally { sessionStorage.removeItem(DEMO_KEY); setSession(null); setMode(null) }
  } }), [mode, session, loading])
  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
}
export function useAppMode() { const value = useContext(AppModeContext); if (!value) throw new Error('AppModeProvider is required'); return value }

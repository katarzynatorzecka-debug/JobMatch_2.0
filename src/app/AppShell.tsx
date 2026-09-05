import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAppMode } from '../features/access/AppModeProvider'

const navigationItems = [
  { to: '/', label: 'Pulpit', end: true },
  { to: '/profile', label: 'Profil', end: true },
  { to: '/offers', label: 'Oferty', end: false },
  { to: '/import', label: 'Import raportu', end: true },
]

export function AppShell() {
  const { mode, exitDemo, signOut, signOutEverywhere } = useAppMode()
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const { pathname } = useLocation()
  const pageBackground = pathname.startsWith('/offers')
    ? 'app-shell--offers'
    : pathname.startsWith('/profile')
      ? 'app-shell--profile'
      : pathname.startsWith('/import')
        ? 'app-shell--import'
        : 'app-shell--start'

  async function handleSignOut(everywhere = false) {
    if (signOutBusy) return
    if (everywhere && !window.confirm('Wylogować konto ze wszystkich urządzeń i przeglądarek?')) return
    setSignOutBusy(true)
    setSignOutError('')
    try {
      await (everywhere ? signOutEverywhere() : signOut())
    } catch {
      setSignOutError('Nie udało się wylogować. Sprawdź połączenie i spróbuj ponownie.')
    } finally {
      setSignOutBusy(false)
    }
  }

  return (
    <div className={`app-shell ${pageBackground}`}>
      <header className="site-header">
        <div className="header-content">
          <Link className="brand" to="/" aria-label="JobMatch — Start">
        <img className="brand-logo brand-logo--header" src="/assets/jobmatch-logo.png" alt="JobMatch" width="251" height="45" />
          </Link>
          <nav aria-label="Główna nawigacja">
            <ul className="main-navigation">
              {navigationItems.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink
                    className={({ isActive }) =>
                      `navigation-link${isActive ? ' navigation-link--active' : ''}`
                    }
                    to={to}
                    end={end}
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          {mode === 'demo' ? <button className="button button--secondary" onClick={exitDemo}>Wyjdź z demo</button> : <div className="header-session-actions">
            <button className="button button--secondary" onClick={() => void handleSignOut()} disabled={signOutBusy}>Wyloguj</button>
            <button className="header-global-signout" onClick={() => void handleSignOut(true)} disabled={signOutBusy}>Wyloguj ze wszystkich urządzeń</button>
            {signOutError && <span className="header-session-error" role="alert">{signOutError}</span>}
          </div>}
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

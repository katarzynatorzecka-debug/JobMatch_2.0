import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAppMode } from '../features/access/AppModeProvider'
import { LanguageToggle } from '../components/LanguageToggle'
import { useI18n } from '../i18n/I18nProvider'

export function AppShell() {
  const { mode, exitDemo, signOut, signOutEverywhere } = useAppMode()
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const { pathname } = useLocation()
  const { t } = useI18n()
  const navigationItems = [
    { to: '/', label: t('shell.nav.dashboard'), end: true },
    { to: '/profile', label: t('shell.nav.profile'), end: true },
    { to: '/offers', label: t('shell.nav.offers'), end: false },
    { to: '/import', label: t('shell.nav.import'), end: true },
  ]
  const pageBackground = pathname.startsWith('/offers')
    ? 'app-shell--offers'
    : pathname.startsWith('/profile')
      ? 'app-shell--profile'
      : pathname.startsWith('/import')
        ? 'app-shell--import'
        : 'app-shell--start'

  async function handleSignOut(everywhere = false) {
    if (signOutBusy) return
    if (everywhere && !window.confirm(t('shell.signOut.confirmEverywhere'))) return
    setSignOutBusy(true)
    setSignOutError('')
    try {
      await (everywhere ? signOutEverywhere() : signOut())
    } catch {
      setSignOutError(t('shell.signOut.error'))
    } finally {
      setSignOutBusy(false)
    }
  }

  return (
    <div className={`app-shell ${pageBackground}`}>
      <header className="site-header">
        <div className="header-content">
          <div className="header-brand-group">
            <LanguageToggle />
            <Link className="brand" to="/" aria-label={t('shell.startAria')}>
              <img className="brand-logo brand-logo--header" src="/assets/jobmatch-logo.png" alt="JobMatch" width="251" height="45" />
            </Link>
          </div>
          <nav aria-label={t('shell.mainNavigation')}>
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
          {mode === 'demo' ? <button className="button button--secondary" onClick={exitDemo}>{t('shell.signOut.demo')}</button> : <div className="header-session-actions">
            <button className="button button--secondary" onClick={() => void handleSignOut()} disabled={signOutBusy}>{t('shell.signOut.current')}</button>
            <button className="header-global-signout" onClick={() => void handleSignOut(true)} disabled={signOutBusy}>{t('shell.signOut.everywhere')}</button>
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

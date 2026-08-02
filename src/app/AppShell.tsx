import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAppMode } from '../features/access/AppModeProvider'

const navigationItems = [
  { to: '/', label: 'Start', end: true },
  { to: '/offers', label: 'Oferty', end: false },
  { to: '/import', label: 'Import raportu', end: true },
  { to: '/profile', label: 'Profil', end: true },
]

export function AppShell() {
  const { mode, exitDemo, signOut } = useAppMode()
  return (
    <div className="app-shell">
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
          <button className="button button--secondary" onClick={() => mode === 'demo' ? exitDemo() : void signOut()}>{mode === 'demo' ? 'Wyjdź z demo' : 'Wyloguj'}</button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

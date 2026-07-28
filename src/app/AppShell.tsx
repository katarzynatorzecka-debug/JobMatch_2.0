import { Link, NavLink, Outlet } from 'react-router-dom'

const navigationItems = [
  { to: '/', label: 'Start', end: true },
  { to: '/offers', label: 'Oferty', end: false },
  { to: '/import', label: 'Import raportu', end: true },
  { to: '/profile', label: 'Profil', end: true },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-content">
          <Link className="brand" to="/" aria-label="JobMatch — Start">
            JobMatch
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
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

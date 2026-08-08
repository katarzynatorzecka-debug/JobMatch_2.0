import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ImportAnalysisPage } from '../pages/ImportAnalysisPage'
import { MessageGeneratorPage } from '../pages/MessageGeneratorPage'
import { OfferDetailsPage } from '../pages/OfferDetailsPage'
import { OffersPage } from '../pages/OffersPage'
import { ProfilePage } from '../pages/ProfilePage'
import { StartPage } from '../pages/StartPage'
import { AccessGate } from '../features/access/AccessGate'
import { useAppMode } from '../features/access/AppModeProvider'

export function AppRoutes() {
  const { mode, loading } = useAppMode()
  const { pathname } = useLocation()
  const pageBackground = pathname.startsWith('/offers')
    ? 'app-shell--offers'
    : pathname.startsWith('/profile')
      ? 'app-shell--profile'
      : pathname.startsWith('/import')
        ? 'app-shell--import'
        : 'app-shell--start'
  if (loading) return <main className={`app-shell ${pageBackground}`} aria-busy="true"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only" role="status">Ładowanie aplikacji</span></main>
  if (!mode) return <AccessGate />
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<StartPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="import" element={<ImportAnalysisPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="offers/:offerId" element={<OfferDetailsPage />} />
        <Route path="offers/:offerId/message" element={<MessageGeneratorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

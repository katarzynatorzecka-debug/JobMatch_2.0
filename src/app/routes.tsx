import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ImportAnalysisPage } from '../pages/ImportAnalysisPage'
import { MessageGeneratorPage } from '../pages/MessageGeneratorPage'
import { OfferDetailsPage } from '../pages/OfferDetailsPage'
import { OffersPage } from '../pages/OffersPage'
import { ProfilePage } from '../pages/ProfilePage'
import { StartPage } from '../pages/StartPage'

export function AppRoutes() {
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

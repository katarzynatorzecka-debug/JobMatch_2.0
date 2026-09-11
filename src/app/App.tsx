import { AppRoutes } from './routes'
import { AppModeProvider } from '../features/access/AppModeProvider'
import { I18nProvider } from '../i18n/I18nProvider'

export function App() {
  return <I18nProvider><AppModeProvider><AppRoutes /></AppModeProvider></I18nProvider>
}

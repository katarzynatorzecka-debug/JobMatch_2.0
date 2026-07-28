import { AppRoutes } from './routes'
import { AppModeProvider } from '../features/access/AppModeProvider'

export function App() {
  return <AppModeProvider><AppRoutes /></AppModeProvider>
}

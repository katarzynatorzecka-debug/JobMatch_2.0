import { useEffect, useState } from 'react'
import { Alert, PageHeader, PrimaryLink, SecondaryLink, SectionCard } from '../components/ui'
import { useAppMode } from '../features/access/AppModeProvider'
import { profileSourceForStart, resolveStartState, type StartState } from '../features/start/startStateResolver'
import { selectDashboardViewModel, type DashboardViewModel } from '../features/dashboard/dashboardSelectors'
import { workspaceRepositoryFor } from '../features/workspace/workspaceService'
import { DashboardPage } from './DashboardPage'
import { loadProfilePresentation } from '../features/profile/profilePresentationStorage'

const flow = ['Profil', 'Raport .eml', 'Analiza', 'Wyniki', 'Wiadomość']

export function OnboardingStart() {
  return (
    <section className="page page--start">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">JobMatch</p>
          <h1>Wybieraj oferty warte Twojej uwagi.</h1>
          <p className="page-intro">Dodaj CV, a JobMatch lokalnie przygotuje większość profilu. Odpowiesz tylko na brakujące pytania i zawsze poprawisz wynik przed zapisem.</p>
          <div className="action-row"><PrimaryLink to="/profile?mode=cv">Dodaj CV i utwórz profil</PrimaryLink><SecondaryLink to="/profile?mode=manual">Uzupełnij profil ręcznie</SecondaryLink></div>
        </div>
        <SectionCard className="hero-result">
          <p className="card-kicker">Po przejściu przez flow</p>
          <h2 className="hero-result__lead">Otrzymasz spersonalizowany PULPIT użytkownika, a wraz z nim czytelną listę wartościowych ofert.</h2>
          <p className="hero-result__detail">Najpierw powstanie profil do sprawdzenia, a potem czytelna lista ofert z pomocniczą oceną i określonymi ryzykami.</p>
        </SectionCard>
      </div>
      <SectionCard title="Prosty proces, decyzja zawsze po Twojej stronie" className="flow-card">
        <ol className="flow-steps">{flow.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
        <p className="quiet-note">CV jest odczytywane lokalnie w przeglądarce. Analiza ofert rozpocznie się dopiero, gdy uruchomisz ją ręcznie.</p>
      </SectionCard>
    </section>
  )
}

export function StartPage() {
  const { mode, session } = useAppMode()
  const [state, setState] = useState<StartState | 'loading' | 'error'>('loading')
  const [dashboard, setDashboard] = useState<DashboardViewModel | null>(null)

  useEffect(() => {
    if (!mode) return
    let active = true
    setState('loading')
    setDashboard(null)
    const profileSource = profileSourceForStart(mode, session?.user)
    void resolveStartState(profileSource).then(async (nextState) => {
      if (!active) return
      if (nextState === 'onboarding') { setState(nextState); return }
      const [profileResult, snapshot] = await Promise.all([profileSource.load(), workspaceRepositoryFor(mode, session?.user).loadWorkspace()])
      if (!active) return
      const localPresentation = loadProfilePresentation().presentation
      const presentation = profileResult.presentation.fullName ? profileResult.presentation : localPresentation
      setDashboard(selectDashboardViewModel({ snapshot, profile: profileResult.data, profilePresentation: presentation }))
      setState(nextState)
    }).catch(() => {
      if (active) setState('error')
    })
    return () => { active = false }
  }, [mode, session])

  if (state === 'loading') return <section className="page page--start" aria-busy="true"><PageHeader eyebrow="JobMatch" title="Przygotowujemy Start" intro="Odczytujemy trwaÅ‚y stan profilu." /></section>
  if (state === 'error') return <section className="page page--start"><Alert title="Nie udało się odczytać stanu profilu" tone="warning">Odśwież stronę i spróbuj ponownie.</Alert></section>
  return state === 'dashboard' && dashboard ? <DashboardPage viewModel={dashboard} /> : <OnboardingStart />
}
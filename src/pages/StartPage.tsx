import { useEffect, useState } from 'react'
import { Alert, PageHeader, PrimaryLink, SecondaryLink, SectionCard } from '../components/ui'
import { useAppMode } from '../features/access/AppModeProvider'
import { profileSourceForStart, resolveStartState, type StartState } from '../features/start/startStateResolver'
import { selectDashboardViewModel, type DashboardViewModel } from '../features/dashboard/dashboardSelectors'
import { workspaceRepositoryFor } from '../features/workspace/workspaceService'
import { DashboardPage } from './DashboardPage'
import { loadProfilePresentation } from '../features/profile/profilePresentationStorage'
import { useI18n } from '../i18n/I18nProvider'

export function OnboardingStart() {
  const { t } = useI18n()
  const flow = [t('start.flow.profile'), t('start.flow.report'), t('start.flow.analysis'), t('start.flow.results'), t('start.flow.message')]
  return (
    <section className="page page--start">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">JobMatch</p>
          <h1>{t('start.hero.title')}</h1>
          <p className="page-intro">{t('start.hero.intro')}</p>
          <div className="action-row"><PrimaryLink to="/profile?mode=cv">{t('start.action.cv')}</PrimaryLink><SecondaryLink to="/profile?mode=manual">{t('start.action.manual')}</SecondaryLink></div>
        </div>
        <SectionCard className="hero-result">
          <p className="card-kicker">{t('start.result.kicker')}</p>
          <h2 className="hero-result__lead">{t('start.result.lead')}</h2>
          <p className="hero-result__detail">{t('start.result.detail')}</p>
        </SectionCard>
      </div>
      <SectionCard title={t('start.flow.heading')} className="flow-card">
        <ol className="flow-steps">{flow.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
        <p className="quiet-note">{t('start.flow.privacy')}</p>
      </SectionCard>
    </section>
  )
}

export function StartPage() {
  const { mode, session } = useAppMode()
  const { t } = useI18n()
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

  if (state === 'loading') return <section className="page page--loading-surface" aria-busy="true"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only" role="status">{t('start.loading')}</span></section>
  if (state === 'error') return <section className="page page--start"><Alert title={t('start.error.title')} tone="warning">{t('start.error.description')}</Alert></section>
  return state === 'dashboard' && dashboard ? <DashboardPage viewModel={dashboard} /> : <OnboardingStart />
}

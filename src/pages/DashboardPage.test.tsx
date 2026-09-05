import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DashboardPage } from './DashboardPage'
import type { DashboardViewModel } from '../features/dashboard/dashboardSelectors'
import { I18nProvider } from '../i18n/I18nProvider'

const renderDashboard = (viewModel: DashboardViewModel, locale: 'pl' | 'en' = 'pl') => renderToStaticMarkup(<I18nProvider initialLocale={locale}><MemoryRouter><DashboardPage viewModel={viewModel} /></MemoryRouter></I18nProvider>)

const base = (): DashboardViewModel => ({
  profile: {
    fullName: 'Katarzyna Test',
    primaryRole: 'Operations Manager',
    alternativeRoles: ['Project Manager'],
    completeness: { completed: 5, total: 5, percentage: 100 },
    profileNeedsAttention: false,
    href: '/profile',
  },
  offers: { recentlyViewed: [], recommended: [], favorites: [], newOffers: [], applied: [], excluded: [] },
  importHistory: [],
  nextStep: { key: 'import-report', title: 'Dodaj pierwszy raport', target: '/import' },
  availability: { cv: 'unavailable', message: 'unavailable' },
})

const card = (overrides: Partial<DashboardViewModel['offers']['recommended'][number]> = {}) => ({
  offerId: 'offer-1',
  title: 'Senior Operations Manager',
  company: 'Acme',
  score: 82,
  reliability: 'standard' as const,
  coverage: 90,
  recommendation: 'Warto aplikować',
  hardFilterStatus: 'pass' as const,
  analysisAvailable: true,
  href: '/offers/offer-1',
  ...overrides,
})

describe('DashboardPage', () => {
  it('renders a real empty dashboard state without fixture offers', () => {
    const markup = renderDashboard(base())
    expect(markup).toContain('data-testid="my-dashboard"')
    expect(markup).toContain('O mnie')
    expect(markup).toContain('Katarzyna Test')
    expect(markup).not.toContain('Twój profil')
    expect(markup).toContain('Profile Assistance')
    expect(markup).toContain('Nie zaimportowano jeszcze żadnego raportu.')
    expect(markup).toContain('Dodaj pierwszy raport')
    expect(markup).not.toContain('Senior Operations Manager')
  })

  it('renders populated canonical offers and history', () => {
    const viewModel = base()
    viewModel.offers.recommended = [card()]
    viewModel.offers.recentlyViewed = [card({ offerId: 'offer-2', title: 'Viewed offer', href: '/offers/offer-2' })]
    viewModel.offers.newOffers = [card({ offerId: 'offer-new', title: 'Fresh offer', href: '/offers/offer-new' })]
    viewModel.offers.applied = [card({ offerId: 'offer-applied', title: 'Applied offer', href: '/offers/offer-applied' })]
    viewModel.importHistory = [{ id: 'session-1', createdAt: '2026-08-07T10:00:00.000Z', sourceType: 'rocketjobs-eml', sourceFilename: 'report.eml', newCount: 2, duplicateCount: 1, invalidCount: 0, needsReviewCount: 0 }]
    viewModel.nextStep = { key: 'review-results', title: 'Sprawdź polecane oferty', target: '/offers' }
    const markup = renderDashboard(viewModel)
    expect(markup).toContain('Senior Operations Manager')
    expect(markup).toContain('/offers/offer-1')
    expect(markup).toContain('report.eml')
    expect(markup).toContain('82')
    expect(markup).toContain('Viewed offer')
    expect(markup).toContain('Generuj z AI')
    expect(markup).toContain('W wersji demo niedostępna.')
    expect(markup).not.toContain('Edytuj profil')
    expect(markup).not.toContain('Nowe oferty')
    expect(markup).not.toContain('dashboard-new')
    expect(markup).toContain('dashboard-applied')
    expect(markup).toContain('Applied offer')
  })

  it('leaves the name area blank when presentation metadata is unavailable', () => {
    const viewModel = base()
    viewModel.profile.fullName = null
    const markup = renderDashboard(viewModel)
    expect(markup).not.toContain('Imię i nazwisko niedostępne')
    expect(markup).not.toContain('Twój profil')
  })

  it('does not render AI score for Hard Filter FAIL', () => {
    const viewModel = base()
    viewModel.offers.recommended = [card({ hardFilterStatus: 'fail', score: 99, recommendation: 'Warto aplikować' })]
    const markup = renderDashboard(viewModel)
    expect(markup).toContain('Nie spełnia wymagań')
    expect(markup).toContain('Score niedostępny dla FAIL')
    expect(markup).not.toContain('Ocena dopasowania: 99 na 100')
  })

  it('labels a low-coverage score as partial on the dashboard', () => {
    const viewModel = base()
    viewModel.offers.recentlyViewed = [card({ score: 100, reliability: 'limited', coverage: 35, recommendation: 'Wymaga sprawdzenia' })]
    const markup = renderDashboard(viewModel)
    expect(markup).toContain('Wynik częściowy')
    expect(markup).toContain('pokrycie 35%')
    expect(markup).toContain('wiarygodność ograniczona')
  })

  it('translates interface labels but preserves offer and company data', () => {
    const viewModel = base()
    viewModel.offers.recommended = [card()]
    const markup = renderDashboard(viewModel, 'en')
    expect(markup).toContain('Dashboard')
    expect(markup).toContain('Recommended offers')
    expect(markup).toContain('Senior Operations Manager')
    expect(markup).toContain('Acme')
    expect(markup).not.toContain('Polecane oferty')
  })
})

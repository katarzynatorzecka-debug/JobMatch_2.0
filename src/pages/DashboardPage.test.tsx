import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DashboardPage } from './DashboardPage'
import type { DashboardViewModel } from '../features/dashboard/dashboardSelectors'

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
  recommendation: 'Warto aplikować',
  hardFilterStatus: 'pass' as const,
  analysisAvailable: true,
  href: '/offers/offer-1',
  ...overrides,
})

describe('DashboardPage', () => {
  it('renders a real empty dashboard state without fixture offers', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><DashboardPage viewModel={base()} /></MemoryRouter>)
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
    const markup = renderToStaticMarkup(<MemoryRouter><DashboardPage viewModel={viewModel} /></MemoryRouter>)
    expect(markup).toContain('Senior Operations Manager')
    expect(markup).toContain('/offers/offer-1')
    expect(markup).toContain('report.eml')
    expect(markup).toContain('82')
    expect(markup).toContain('Viewed offer')
    expect(markup.match(/Edytuj profil/g)?.length).toBe(1)
    expect(markup).not.toContain('Nowe oferty')
    expect(markup).not.toContain('dashboard-new')
    expect(markup).toContain('dashboard-applied')
    expect(markup).toContain('Applied offer')
  })

  it('leaves the name area blank when presentation metadata is unavailable', () => {
    const viewModel = base()
    viewModel.profile.fullName = null
    const markup = renderToStaticMarkup(<MemoryRouter><DashboardPage viewModel={viewModel} /></MemoryRouter>)
    expect(markup).not.toContain('Imię i nazwisko niedostępne')
    expect(markup).not.toContain('Twój profil')
  })

  it('does not render AI score for Hard Filter FAIL', () => {
    const viewModel = base()
    viewModel.offers.recommended = [card({ hardFilterStatus: 'fail', score: 99, recommendation: 'Warto aplikować' })]
    const markup = renderToStaticMarkup(<MemoryRouter><DashboardPage viewModel={viewModel} /></MemoryRouter>)
    expect(markup).toContain('Nie spełnia wymagań')
    expect(markup).toContain('Score niedostępny dla FAIL')
    expect(markup).not.toContain('Ocena dopasowania: 99 na 100')
  })
})

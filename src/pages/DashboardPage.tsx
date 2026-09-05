import { Link } from 'react-router-dom'
import { SectionCard, ScoreBadge } from '../components/ui'
import type { DashboardOfferCard, DashboardViewModel } from '../features/dashboard/dashboardSelectors'
import { useI18n } from '../i18n/I18nProvider'
import type { Translate } from '../i18n/translationTypes'

function dateLabel(value: string, unavailable: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? unavailable : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(date)
}

function hardFilterLabel(status: DashboardOfferCard['hardFilterStatus'], t: Translate) {
  if (status === 'fail') return t('dashboard.hardFilter.fail')
  if (status === 'needs_review') return t('dashboard.hardFilter.review')
  if (status === 'pass') return t('dashboard.hardFilter.pass')
  return t('dashboard.hardFilter.none')
}

function OfferPreview({ item }: { item: DashboardOfferCard }) {
  const { t } = useI18n()
  const blocked = item.hardFilterStatus === 'fail'
  return (
    <article className="dashboard-offer-card">
      <div className="dashboard-offer-card__heading">
        <div>
          <h3><Link to={item.href}>{item.title}</Link></h3>
          <p>{item.company}</p>
        </div>
        {!blocked && item.score !== null && <ScoreBadge score={item.score} limited={item.reliability === 'limited'} />}
      </div>
      <div className="dashboard-offer-card__meta">
        <span>{hardFilterLabel(item.hardFilterStatus, t)}</span>
        {item.analysisAvailable && <span>{t('dashboard.analysisAvailable')}</span>}
        {item.reliability === 'limited' && <span>{item.coverage === null ? t('dashboard.partialScore') : t('dashboard.partialCoverage', { coverage: Math.round(item.coverage) })}</span>}
        {blocked && <span>{t('dashboard.scoreUnavailable')}</span>}
      </div>
      {item.recommendation && !blocked && <p className="dashboard-offer-card__recommendation">{item.recommendation}</p>}
      <Link className="text-link" to={item.href}>{t('dashboard.viewDetails')}</Link>
    </article>
  )
}

function OfferSection({ id, title, items, empty, limit = 3 }: { id: string; title: string; items: DashboardOfferCard[]; empty: string; limit?: number }) {
  const { t } = useI18n()
  const visible = items.slice(0, limit)
  return (
    <section id={id} className="dashboard-section" aria-labelledby={id + '-title'}>
      <div className="dashboard-section__heading">
        <h2 id={id + '-title'}>{title}</h2>
        {items.length > limit && <Link className="text-link" to="/offers">{t('dashboard.viewAll')}</Link>}
      </div>
      {visible.length ? <div className="dashboard-offer-list">{visible.map((item) => <OfferPreview key={item.offerId} item={item} />)}</div> : <p className="dashboard-empty">{empty}</p>}
    </section>
  )
}

function ProfileAssistance({ viewModel: _viewModel }: { viewModel: DashboardViewModel }) {
  const { t } = useI18n()
  return (
    <SectionCard className="dashboard-assistance">
      <div className="dashboard-assistance__title"><span className="dashboard-assistance__icon" aria-hidden="true">AI</span><h2>{t('dashboard.assistance.title')}</h2></div>
        <p className="dashboard-assistance__copy">{t('dashboard.assistance.copy')}</p>
      <button className="button button--primary" type="button" disabled>{t('dashboard.assistance.generate')}</button>
      <small className="dashboard-assistance__note">{t('dashboard.assistance.unavailableDemo')}</small>
    </SectionCard>
  )
}

export function DashboardPage({ viewModel }: { viewModel: DashboardViewModel }) {
  const { t } = useI18n()
  const { profile, offers, importHistory, nextStep, availability } = viewModel
  const displayName = profile.fullName || ''
  return (
    <section className="page page--dashboard" data-testid="my-dashboard">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar" aria-label={t('dashboard.navigation')}>
          <div className="dashboard-sidebar__identity">
            <span className="dashboard-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span>
            <strong>{displayName}</strong>
            <span>{profile.primaryRole || t('dashboard.roleMissing')}</span>
          </div>
          <nav>
            <ul>
              <li><a className="dashboard-sidebar__link dashboard-sidebar__link--active" href="#dashboard-top">{t('dashboard.nav.dashboard')}</a></li>
              <li><Link className="dashboard-sidebar__link" to="/offers">{t('dashboard.nav.offers')}</Link></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-history">{t('dashboard.nav.history')}</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-recent">{t('dashboard.nav.recent')}</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-recommended">{t('dashboard.nav.recommendations')}</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-favorites">{t('dashboard.nav.favorites')}</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-applied">{t('dashboard.nav.applied')}</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-excluded">{t('dashboard.nav.excluded')}</a></li>
              <li><Link className="dashboard-sidebar__link" to="/profile">{t('dashboard.nav.profile')}</Link></li>
            </ul>
          </nav>
        </aside>
        <div className="dashboard-content" id="dashboard-top">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">JobMatch</p>
              <h1>{t('dashboard.title')}</h1>
              <p className="page-intro">{t('dashboard.intro')}</p>
            </div>
          </header>
          <div className="dashboard-hero-grid">
            <SectionCard className="dashboard-about">
              <p className="card-kicker">{t('dashboard.about')}</p>
              <h2>{displayName}</h2>
              <p className="dashboard-about__role">{profile.primaryRole || t('dashboard.roleIncomplete')}</p>
              {profile.alternativeRoles.length > 0 && <p>{t('dashboard.alternativeRoles')} {profile.alternativeRoles.join(', ')}</p>}
              <div className="completion"><span>{t('dashboard.completeness')} <strong>{profile.completeness.percentage}%</strong></span><div className="progress-track"><span style={{ width: profile.completeness.percentage + '%' }} /></div></div>
              <div className="dashboard-availability"><span>{t('dashboard.cv')} {availability.cv === 'available' ? t('dashboard.available') : availability.cv === 'missing' ? t('dashboard.missing') : t('dashboard.sourceUnconfirmed')}</span><span>{t('dashboard.messages')} {availability.message === 'available' ? t('dashboard.available') : t('dashboard.unavailable')}</span></div>
            </SectionCard>
            <ProfileAssistance viewModel={viewModel} />
          </div>
          <OfferSection id="dashboard-recent" title={t('dashboard.section.recent')} items={offers.recentlyViewed} empty={t('dashboard.empty.recent')} />
          <OfferSection id="dashboard-recommended" title={t('dashboard.section.recommended')} items={offers.recommended} empty={t('dashboard.empty.recommended')} />
          <OfferSection id="dashboard-favorites" title={t('dashboard.section.favorites')} items={offers.favorites} empty={t('dashboard.empty.favorites')} />
          <section id="dashboard-history" className="dashboard-section" aria-labelledby="dashboard-history-title">
            <div className="dashboard-section__heading"><h2 id="dashboard-history-title">{t('dashboard.section.history')}</h2><Link className="text-link" to="/import">{t('dashboard.addReport')}</Link></div>
            {importHistory.length ? <div className="dashboard-history-list">{importHistory.slice(0, 3).map((session) => <article className="dashboard-history-card" key={session.id}><strong>{session.sourceFilename || session.sourceType}</strong><span>{dateLabel(session.createdAt, t('dashboard.dateUnavailable'))}</span><span>{t('dashboard.history.counts', { newCount: session.newCount, duplicateCount: session.duplicateCount })}</span>{(session.needsReviewCount || session.invalidCount) > 0 && <small>{t('dashboard.history.issues', { reviewCount: session.needsReviewCount, errorCount: session.invalidCount })}</small>}</article>)}</div> : <p className="dashboard-empty">{t('dashboard.empty.history')}</p>}
          </section>
          <OfferSection id="dashboard-applied" title={t('dashboard.section.applied')} items={offers.applied} empty={t('dashboard.empty.applied')} limit={3} />
          <OfferSection id="dashboard-excluded" title={t('dashboard.section.excluded')} items={offers.excluded} empty={t('dashboard.empty.excluded')} limit={2} />
          <SectionCard className="dashboard-next-step">
            <p className="card-kicker">{t('dashboard.nextStep')}</p>
            <h2>{nextStep.key === 'complete-profile' ? t('dashboard.next.title.completeProfile') : nextStep.key === 'analyze-offers' ? t('dashboard.next.title.analyzeOffers') : nextStep.key === 'review-results' ? t('dashboard.next.title.reviewResults') : importHistory.length ? t('dashboard.next.title.anotherReport') : t('dashboard.next.title.firstReport')}</h2>
            <p>{nextStep.key === 'import-report' ? t('dashboard.next.copy.import') : nextStep.key === 'analyze-offers' ? t('dashboard.next.copy.analyze') : nextStep.key === 'complete-profile' ? t('dashboard.next.copy.profile') : t('dashboard.next.copy.review')}</p>
            <Link className="button button--primary" to={nextStep.target}>{nextStep.key === 'import-report' ? t('dashboard.next.action.report') : nextStep.key === 'complete-profile' ? t('dashboard.next.action.profile') : t('dashboard.next.action.offers')}</Link>
          </SectionCard>
        </div>
      </div>
    </section>
  )
}

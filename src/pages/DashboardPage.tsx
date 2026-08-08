import { Link } from 'react-router-dom'
import { SectionCard, ScoreBadge } from '../components/ui'
import type { DashboardOfferCard, DashboardViewModel } from '../features/dashboard/dashboardSelectors'

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data niedostępna' : new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' }).format(date)
}

function hardFilterLabel(status: DashboardOfferCard['hardFilterStatus']) {
  if (status === 'fail') return 'Nie spełnia wymagań'
  if (status === 'needs_review') return 'Wymaga sprawdzenia'
  if (status === 'pass') return 'Przechodzi'
  return 'Hard Filter: brak wyniku'
}

function OfferPreview({ item }: { item: DashboardOfferCard }) {
  const blocked = item.hardFilterStatus === 'fail'
  return (
    <article className="dashboard-offer-card">
      <div className="dashboard-offer-card__heading">
        <div>
          <h3><Link to={item.href}>{item.title}</Link></h3>
          <p>{item.company}</p>
        </div>
        {!blocked && item.score !== null && <ScoreBadge score={item.score} />}
      </div>
      <div className="dashboard-offer-card__meta">
        <span>{hardFilterLabel(item.hardFilterStatus)}</span>
        {item.analysisAvailable && <span>Analiza dostępna</span>}
        {blocked && <span>Score niedostępny dla FAIL</span>}
      </div>
      {item.recommendation && !blocked && <p className="dashboard-offer-card__recommendation">{item.recommendation}</p>}
      <Link className="text-link" to={item.href}>Zobacz szczegóły →</Link>
    </article>
  )
}

function OfferSection({ id, title, items, empty, limit = 3 }: { id: string; title: string; items: DashboardOfferCard[]; empty: string; limit?: number }) {
  const visible = items.slice(0, limit)
  return (
    <section id={id} className="dashboard-section" aria-labelledby={id + '-title'}>
      <div className="dashboard-section__heading">
        <h2 id={id + '-title'}>{title}</h2>
        {items.length > limit && <Link className="text-link" to="/offers">Zobacz wszystkie</Link>}
      </div>
      {visible.length ? <div className="dashboard-offer-list">{visible.map((item) => <OfferPreview key={item.offerId} item={item} />)}</div> : <p className="dashboard-empty">{empty}</p>}
    </section>
  )
}

function ProfileAssistance({ viewModel }: { viewModel: DashboardViewModel }) {
  const { profile } = viewModel
  return (
    <SectionCard className={'dashboard-assistance' + (profile.profileNeedsAttention ? ' dashboard-assistance--attention' : '')}>
      <p className="card-kicker">Profile Assistance</p>
      <h2>{profile.profileNeedsAttention ? 'Twój profil wymaga uzupełnienia' : 'Profil gotowy do dopasowywania ofert'}</h2>
      <p>{profile.profileNeedsAttention ? 'Uzupełniono ' + profile.completeness.completed + ' z ' + profile.completeness.total + ' kluczowych obszarów.' : 'Możesz przejść do importu raportu i oceny ofert.'}</p>
      <Link className="button button--secondary" to="/profile">{profile.profileNeedsAttention ? 'Uzupełnij profil' : 'Edytuj profil'}</Link>
    </SectionCard>
  )
}

export function DashboardPage({ viewModel }: { viewModel: DashboardViewModel }) {
  const { profile, offers, importHistory, nextStep, availability } = viewModel
  const displayName = profile.fullName || ''
  return (
    <section className="page page--dashboard" data-testid="my-dashboard">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar" aria-label="Nawigacja pulpitu">
          <div className="dashboard-sidebar__identity">
            <span className="dashboard-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span>
            <strong>{displayName}</strong>
            <span>{profile.primaryRole || 'Uzupełnij rolę'}</span>
          </div>
          <nav>
            <ul>
              <li><a className="dashboard-sidebar__link dashboard-sidebar__link--active" href="#dashboard-top">Pulpit</a></li>
              <li><Link className="dashboard-sidebar__link" to="/offers">Oferty</Link></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-history">Historia raportów</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-recent">Ostatnio przeglądane</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-recommended">Rekomendacje</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-favorites">Ulubione</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-applied">Aplikowano</a></li>
              <li><a className="dashboard-sidebar__link" href="#dashboard-excluded">Wykluczone</a></li>
              <li><Link className="dashboard-sidebar__link" to="/profile">Profil</Link></li>
            </ul>
          </nav>
        </aside>
        <div className="dashboard-content" id="dashboard-top">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">JobMatch</p>
              <h1>Pulpit</h1>
              <p className="page-intro">Najważniejsze informacje z Twojego profilu i workspace w jednym miejscu.</p>
            </div>
          </header>
          <div className="dashboard-hero-grid">
            <SectionCard className="dashboard-about">
              <p className="card-kicker">O mnie</p>
              <h2>{displayName}</h2>
              <p className="dashboard-about__role">{profile.primaryRole || 'Rola do uzupełnienia'}</p>
              {profile.alternativeRoles.length > 0 && <p>Alternatywne role: {profile.alternativeRoles.join(', ')}</p>}
              <div className="completion"><span>Kompletność profilu <strong>{profile.completeness.percentage}%</strong></span><div className="progress-track"><span style={{ width: profile.completeness.percentage + '%' }} /></div></div>
              <div className="dashboard-availability"><span>CV: {availability.cv === 'available' ? 'dostępne' : availability.cv === 'missing' ? 'brak' : 'brak potwierdzonego źródła'}</span><span>Wiadomości: {availability.message === 'available' ? 'dostępne' : 'niedostępne'}</span></div>
            </SectionCard>
            <ProfileAssistance viewModel={viewModel} />
          </div>
          <OfferSection id="dashboard-recent" title="Ostatnio przeglądane" items={offers.recentlyViewed} empty="Nie masz jeszcze ostatnio przeglądanych ofert." />
          <OfferSection id="dashboard-recommended" title="Polecane oferty" items={offers.recommended} empty="Brak przeanalizowanych ofert spełniających warunki rekomendacji. Przejdź do ofert lub dodaj raport." />
          <OfferSection id="dashboard-favorites" title="Ulubione" items={offers.favorites} empty="Nie masz jeszcze ulubionych ofert." />
          <section id="dashboard-history" className="dashboard-section" aria-labelledby="dashboard-history-title">
            <div className="dashboard-section__heading"><h2 id="dashboard-history-title">Historia raportów</h2><Link className="text-link" to="/import">Dodaj raport</Link></div>
            {importHistory.length ? <div className="dashboard-history-list">{importHistory.slice(0, 3).map((session) => <article className="dashboard-history-card" key={session.id}><strong>{session.sourceFilename || session.sourceType}</strong><span>{dateLabel(session.createdAt)}</span><span>Nowe: {session.newCount} · Duplikaty: {session.duplicateCount}</span>{(session.needsReviewCount || session.invalidCount) > 0 && <small>Do sprawdzenia: {session.needsReviewCount} · Błędy: {session.invalidCount}</small>}</article>)}</div> : <p className="dashboard-empty">Nie zaimportowano jeszcze żadnego raportu.</p>}
          </section>
          <OfferSection id="dashboard-applied" title="Aplikowano" items={offers.applied} empty="Nie oznaczono jeszcze aplikowanych ofert." limit={3} />
          <OfferSection id="dashboard-excluded" title="Wykluczone" items={offers.excluded} empty="Brak wykluczonych ofert." limit={2} />
          <SectionCard className="dashboard-next-step">
            <p className="card-kicker">Następny krok</p>
            <h2>{nextStep.title}</h2>
            <p>{nextStep.key === 'import-report' ? 'Dodaj raport ofert, aby rozpocząć pracę z workspace.' : nextStep.key === 'analyze-offers' ? 'Masz oferty gotowe do sprawdzenia. Przejdź do listy, aby uruchomić analizę ręcznie.' : nextStep.key === 'complete-profile' ? 'Uzupełnij najważniejsze informacje, aby dopasowanie było bardziej wiarygodne.' : 'Przejrzyj zapisane wyniki i wybierz oferty warte Twojej uwagi.'}</p>
            <Link className="button button--primary" to={nextStep.target}>{nextStep.key === 'import-report' ? 'Dodaj raport' : nextStep.key === 'complete-profile' ? 'Uzupełnij profil' : 'Przejdź do ofert'}</Link>
          </SectionCard>
        </div>
      </div>
    </section>
  )
}

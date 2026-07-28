import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, ScoreBadge, SourceBadge, StatusBadge } from '../components/ui'
import { demoOffers, type DemoStatus } from '../demo/offers'

type Filter = 'all' | DemoStatus

function OfferCard({ id, title, company, demoAssessment, sourceState }: typeof demoOffers[number]) {
  return <article className="offer-card"><div className="offer-card__header"><div><h2>{title}</h2><p>{company}</p></div><ScoreBadge score={demoAssessment.score} /></div><div className="offer-card__meta"><StatusBadge status={demoAssessment.status} /><SourceBadge state={sourceState} /></div><p className="recommendation">{demoAssessment.recommendation}</p><p className="risk-summary"><strong>Najważniejsze ryzyko:</strong> {demoAssessment.primaryRisk}</p><Link className="text-link" to={`/offers/${id}`}>Zobacz szczegóły <span aria-hidden="true">→</span></Link></article>
}

export function OffersPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'desc' | 'asc'>('desc')
  const visible = useMemo(() => demoOffers.filter((offer) => filter === 'all' || offer.demoAssessment.status === filter).sort((a, b) => sort === 'desc' ? b.demoAssessment.score - a.demoAssessment.score : a.demoAssessment.score - b.demoAssessment.score), [filter, sort])
  const active = visible.filter((offer) => offer.demoAssessment.status !== 'rejected')
  const rejected = visible.filter((offer) => offer.demoAssessment.status === 'rejected')
  return <section className="page page--wide"><PageHeader eyebrow="Wyniki demonstracyjne" title="Oferty do sprawdzenia" intro={`Pokazujemy ${demoOffers.length} ofert z dwóch raportów RocketJobs. Oceny i statusy są statyczne — służą wyłącznie ocenie kierunku produktu.`} />
    <div className="list-controls"><label>Status<select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">Wszystkie statusy</option><option value="worth">Warto aplikować</option><option value="review">Wymaga sprawdzenia</option><option value="rejected">Odrzucone</option></select></label><label>Sortowanie<select value={sort} onChange={(event) => setSort(event.target.value as 'desc' | 'asc')}><option value="desc">Ocena: od najwyższej</option><option value="asc">Ocena: od najniższej</option></select></label></div>
    {active.length > 0 && <section className="offer-section"><h2>{filter === 'all' ? 'Rekomendowane i wymagające sprawdzenia' : 'Wyniki filtrowania'}</h2><div className="offer-list">{active.map((offer) => <OfferCard key={offer.id} {...offer} />)}</div></section>}
    {rejected.length > 0 && <section className="offer-section offer-section--rejected"><h2>{filter === 'all' ? 'Odrzucone — pozostają do wglądu' : 'Odrzucone'}</h2><p>Nie znikają z listy: możesz nadal przejrzeć powód i szczegóły oferty.</p><div className="offer-list">{rejected.map((offer) => <OfferCard key={offer.id} {...offer} />)}</div></section>}
    {visible.length === 0 && <p className="empty-state">Żadna oferta nie spełnia wybranego filtra.</p>}
  </section>
}

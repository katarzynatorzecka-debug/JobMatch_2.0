import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FilteredJobOffer, HardFilterStatus } from '../contracts/hardFilter'
import { Alert, HardFilterStatusBadge, PageHeader, PrimaryLink, ScoreBadge, SourceBadge, StatusBadge } from '../components/ui'
import { demoOffers, type DemoStatus } from '../demo/offers'
import { loadHardFilterSession } from '../features/hardFilter/hardFilterSessionStorage'
import { offerMeta, primaryReason, sortFilteredOffers } from '../features/offers/offerResultsAdapter'

type Filter = 'all' | HardFilterStatus
type DemoFilter = 'all' | DemoStatus

function ImportedOfferCard({ item }: { item: FilteredJobOffer }) {
  const { offer, result } = item
  return <article className="offer-card"><div className="offer-card__header"><div><h2>{offer.title}</h2><p>{offer.company}</p></div><HardFilterStatusBadge status={result.status} /></div><div className="offer-card__meta"><span className="imported-source">Źródło: {offer.sourceLabel ?? 'zaimportowany raport'}</span>{offerMeta(item).map((value) => <span key={value}>{value}</span>)}</div><p className="risk-summary"><strong>Główny powód:</strong> {primaryReason(item)}</p>{result.missingInformation.length > 0 && <ul className="offer-card__reasons">{result.missingInformation.map((item) => <li key={item}>Brak: {item}</li>)}</ul>}<Link className="text-link" to={`/offers/${offer.id}`}>Zobacz szczegóły <span aria-hidden="true">→</span></Link></article>
}

function DemoOfferCard({ id, title, company, demoAssessment, sourceState }: typeof demoOffers[number]) {
  return <article className="offer-card"><div className="offer-card__header"><div><h2>{title}</h2><p>{company}</p></div><ScoreBadge score={demoAssessment.score} /></div><div className="offer-card__meta"><StatusBadge status={demoAssessment.status} /><SourceBadge state={sourceState} /></div><p className="recommendation">{demoAssessment.recommendation}</p><Link className="text-link" to={`/offers/${id}`}>Zobacz szczegóły <span aria-hidden="true">→</span></Link></article>
}

export function OffersPage() {
  const sessionResult = loadHardFilterSession()
  const [filter, setFilter] = useState<Filter>('all')
  const [showDemo, setShowDemo] = useState(false)
  const [demoFilter, setDemoFilter] = useState<DemoFilter>('all')
  const imported = useMemo(() => sortFilteredOffers(sessionResult.session?.filteredOffers ?? []), [sessionResult.session])
  const visible = imported.filter((item) => filter === 'all' || item.result.status === filter)
  const active = visible.filter((item) => item.result.status !== 'fail')
  const rejected = visible.filter((item) => item.result.status === 'fail')
  const visibleDemo = demoOffers.filter((offer) => demoFilter === 'all' || offer.demoAssessment.status === demoFilter)

  if (!imported.length && !showDemo) return <section className="page page--wide"><PageHeader eyebrow="Wyniki ofert" title="Brak wyników Hard Filter" intro="Zaimportuj raport i uruchom Hard Filter z zapisanym profilem, aby zobaczyć rzeczywiste oferty." />{sessionResult.warning && <Alert title="Wynik wymaga ponownego utworzenia" tone="warning">{sessionResult.warning}</Alert>}<div className="action-row"><PrimaryLink to="/import">Przejdź do importu</PrimaryLink><button className="button button--secondary" onClick={() => setShowDemo(true)}>Pokaż dane demonstracyjne</button></div></section>

  if (showDemo) return <section className="page page--wide"><PageHeader eyebrow="Tryb demonstracyjny" title="Oferty demonstracyjne" intro="Dane i oceny poniżej nie pochodzą z bieżącego importu." /><Alert title="Tryb demonstracyjny — dane nie pochodzą z bieżącego importu." tone="warning">Statyczne score i rekomendacje są dostępne wyłącznie jako kontrolowany fallback.</Alert><div className="list-controls"><label>Status<select value={demoFilter} onChange={(event) => setDemoFilter(event.target.value as DemoFilter)}><option value="all">Wszystkie statusy</option><option value="worth">Warto aplikować</option><option value="review">Wymaga sprawdzenia</option><option value="rejected">Odrzucone</option></select></label><button className="button button--secondary" onClick={() => setShowDemo(false)}>Wróć do wyników</button></div><section className="offer-section"><div className="offer-list">{visibleDemo.map((offer) => <DemoOfferCard key={offer.id} {...offer} />)}</div></section></section>

  return <section className="page page--wide"><PageHeader eyebrow="Wyniki Hard Filter" title="Oferty do sprawdzenia" intro={`Pokazujemy ${imported.length} rzeczywistych ofert z bieżącej sesji. Status wynika wyłącznie z zapisanego profilu i dostępnych danych importu.`} />{sessionResult.warning && <Alert title="Uwaga dotycząca wyniku" tone="warning">{sessionResult.warning}</Alert>}<div className="list-controls"><label>Status<select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">Wszystkie</option><option value="pass">Przechodzi</option><option value="weak">Wymaga sprawdzenia</option><option value="fail">Odrzucona</option></select></label><span className="field-hint">Kolejność: Przechodzi → Wymaga sprawdzenia → Odrzucona. Wewnątrz statusu zachowujemy kolejność importu.</span></div>{active.length > 0 && <section className="offer-section"><h2>{filter === 'all' ? 'Przechodzi i wymaga sprawdzenia' : 'Wyniki filtrowania'}</h2><div className="offer-list">{active.map((item) => <ImportedOfferCard key={item.offer.id} item={item} />)}</div></section>}{rejected.length > 0 && <section className="offer-section offer-section--rejected"><h2>Odrzucone — pozostają do wglądu</h2><p>Oferta nie znika z listy: można sprawdzić potwierdzony powód odrzucenia.</p><div className="offer-list">{rejected.map((item) => <ImportedOfferCard key={item.offer.id} item={item} />)}</div></section>}{visible.length === 0 && <p className="empty-state">Żadna oferta nie spełnia wybranego filtra.</p>}</section>
}

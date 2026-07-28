import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert, CategoryScore, HardFilterStatusBadge, PageHeader, PrimaryLink, ScoreBadge, SectionCard, SourceBadge, StatusBadge } from '../components/ui'
import { findDemoOffer } from '../demo/offers'
import { loadHardFilterSession } from '../features/hardFilter/hardFilterSessionStorage'
import { findFilteredOffer } from '../features/offers/offerResultsAdapter'

function ImportedOfferDetails({ offerId }: { offerId: string | undefined }) {
  const loaded = loadHardFilterSession()
  const item = findFilteredOffer(loaded.session?.filteredOffers ?? [], offerId)
  if (!item) return null
  const { offer, result } = item
  return <section className="page page--wide"><Link className="back-link" to="/offers">← Wróć do wyników</Link><div className="details-heading"><PageHeader eyebrow="Szczegóły zaimportowanej oferty" title={offer.title} intro={offer.company} /><HardFilterStatusBadge status={result.status} /></div><div className="details-meta"><span>Źródło: {offer.sourceLabel ?? 'zaimportowany raport'}</span>{offer.location && <span>{offer.location}</span>}{offer.workMode && <span>{offer.workMode}</span>}{offer.contractType && <span>{offer.contractType}</span>}{offer.salary && <span>{offer.salary}</span>}</div><SectionCard title="Wynik Hard Filter" className="recommendation-panel"><p>{result.reasons[0]?.label ?? 'Brak potwierdzonych konfliktów w dostępnych danych.'}</p><small>To deterministyczny wynik reguł. Nie jest oceną AI ani score 0–100.</small></SectionCard><div className="details-grid"><SectionCard title="Wszystkie powody"><ul className="risk-list">{result.reasons.length ? result.reasons.map((reason) => <li key={reason.code}>{reason.label}</li>) : <li>Brak potwierdzonych konfliktów.</li>}</ul></SectionCard><SectionCard title="Brakujące informacje"><ul className="missing-list">{result.missingInformation.length ? result.missingInformation.map((item) => <li key={item}>{item}</li>) : <li>Brak zgłoszonych braków krytycznych dla Hard Filter.</li>}</ul></SectionCard></div><SectionCard title="Sprawdzone kryteria"><ul className="check-list">{result.checkedCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></SectionCard><Alert title="Analiza AI" tone="info">Ocena AI, score, rekomendacja jakościowa oraz generator wiadomości będą dostępne w kolejnym etapie. Nie przypisujemy danych demo do tej oferty.</Alert><div className="action-row action-row--spaced"><Link className="button button--secondary" to="/offers">Wróć do listy</Link>{offer.sourceUrl ? <a className="button button--secondary" href={offer.sourceUrl} target="_blank" rel="noreferrer">Otwórz ofertę źródłową</a> : <span className="field-hint">Link źródłowy nie był dostępny w raporcie.</span>}</div></section>
}

function DemoOfferDetails({ offerId }: { offerId: string | undefined }) {
  const offer = findDemoOffer(offerId)
  if (!offer) return <Navigate to="/offers" replace />
  const { demoAssessment, facts } = offer
  return <section className="page page--wide"><Link className="back-link" to="/offers">← Wróć do wyników</Link><Alert title="Tryb demonstracyjny" tone="warning">Dane i oceny tej oferty nie pochodzą z bieżącego importu.</Alert><div className="details-heading"><PageHeader eyebrow="Szczegóły demonstracyjne" title={offer.title} intro={offer.company} /><div className="details-score"><ScoreBadge score={demoAssessment.score} /><span>Statyczna ocena<br />demonstracyjna</span></div></div><div className="details-meta"><StatusBadge status={demoAssessment.status} /><SourceBadge state={offer.sourceState} /><span>{offer.location}</span><span>{offer.workMode}</span><span>{offer.contractType}</span></div><SectionCard title="Rekomendacja demonstracyjna" className="recommendation-panel"><p>{demoAssessment.recommendation}</p></SectionCard><div className="details-grid"><SectionCard title="Oceny cząstkowe"><CategoryScore label="Doświadczenie" score={demoAssessment.categoryScores.experience} /><CategoryScore label="Umiejętności" score={demoAssessment.categoryScores.skills} /></SectionCard><SectionCard title="Fakty z materiału oferty"><p>{facts.summary}</p></SectionCard></div><div className="action-row action-row--spaced"><Link className="button button--secondary" to="/offers">Wróć do listy</Link><PrimaryLink to={`/offers/${offer.id}/message`}>Wygeneruj wiadomość</PrimaryLink></div></section>
}

export function OfferDetailsPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const imported = findFilteredOffer(loadHardFilterSession().session?.filteredOffers ?? [], offerId)
  return imported ? <ImportedOfferDetails offerId={offerId} /> : <DemoOfferDetails offerId={offerId} />
}

import { Link, Navigate, useParams } from 'react-router-dom'
import { CategoryScore, PageHeader, PrimaryLink, ScoreBadge, SectionCard, SourceBadge, StatusBadge } from '../components/ui'
import { findDemoOffer } from '../demo/offers'

export function OfferDetailsPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const offer = findDemoOffer(offerId)
  if (!offer) return <Navigate to="/offers" replace />
  const { demoAssessment, facts } = offer
  return <section className="page page--wide">
    <Link className="back-link" to="/offers">← Wróć do wyników</Link>
    <div className="details-heading"><PageHeader eyebrow="Szczegóły oferty" title={offer.title} intro={offer.company} /><div className="details-score"><ScoreBadge score={demoAssessment.score} /><span>Ocena dopasowania<br />na podstawie dostępnych danych</span></div></div>
    <div className="details-meta"><StatusBadge status={demoAssessment.status} /><SourceBadge state={offer.sourceState} /><span>{offer.location}</span><span>{offer.workMode}</span><span>{offer.contractType}</span><span>{offer.seniority}</span>{offer.salary && <span>{offer.salary}</span>}</div>
    <SectionCard title="Rekomendacja demonstracyjna" className="recommendation-panel"><p>{demoAssessment.recommendation}</p><small>Score, status i poniższe oceny są statyczną warstwą demonstracyjną Checkpointu 2.</small></SectionCard>
    <div className="details-grid"><SectionCard title="Oceny cząstkowe"><CategoryScore label="Doświadczenie" score={demoAssessment.categoryScores.experience} /><CategoryScore label="Umiejętności" score={demoAssessment.categoryScores.skills} /><CategoryScore label="Preferencje" score={demoAssessment.categoryScores.preferences} /><CategoryScore label="Rozwój" score={demoAssessment.categoryScores.growth} /></SectionCard><SectionCard title="Fakty z materiału oferty"><p>{facts.summary}</p><h3>Warunki</h3><dl className="facts-list"><div><dt>Lokalizacja</dt><dd>{offer.location}</dd></div><div><dt>Tryb pracy</dt><dd>{offer.workMode}</dd></div><div><dt>Umowa</dt><dd>{offer.contractType}</dd></div>{offer.salary && <div><dt>Wynagrodzenie</dt><dd>{offer.salary}</dd></div>}</dl></SectionCard></div>
    <div className="details-grid"><SectionCard title="Mocne strony"><ul className="check-list">{demoAssessment.strengths.map((item) => <li key={item}>{item}</li>)}</ul></SectionCard><SectionCard title="Ryzyka"><ul className="risk-list">{demoAssessment.risks.map((item) => <li key={item}>{item}</li>)}</ul></SectionCard></div>
    <div className="details-grid"><SectionCard title="Zakres roli"><h3>Wybrane obowiązki</h3><ul>{facts.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul><h3>Wybrane wymagania</h3><ul>{facts.requirements.map((item) => <li key={item}>{item}</li>)}</ul></SectionCard><SectionCard title="Brakujące informacje"><ul className="missing-list">{facts.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul><p className="field-hint">Źródło treści jest oznaczone jawnie: makieta nie pobiera obecnie stron ofert.</p></SectionCard></div>
    <div className="action-row action-row--spaced"><Link className="button button--secondary" to="/offers">Wróć do listy</Link>{offer.sourceUrl ? <a className="button button--secondary" href={offer.sourceUrl} target="_blank" rel="noreferrer">Otwórz ofertę źródłową</a> : <span className="field-hint">Link źródłowy niedostępny w materiale demonstracyjnym</span>}<PrimaryLink to={`/offers/${offer.id}/message`}>Wygeneruj wiadomość</PrimaryLink></div>
  </section>
}

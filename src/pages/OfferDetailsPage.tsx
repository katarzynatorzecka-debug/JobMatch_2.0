import { Link, useParams } from 'react-router-dom'

export function OfferDetailsPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const offerPath = `/offers/${offerId ?? 'demo-offer'}`

  return (
    <section className="page">
      <p className="eyebrow">Widok demonstracyjny</p>
      <h1>Szczegóły oferty</h1>
      <p className="page-intro">Ten ekran będzie prezentował pełniejsze informacje o wybranej ofercie.</p>
      <div className="placeholder-card">
        <h2>Wybrana oferta</h2>
        <p>Identyfikator demonstracyjny: <code>{offerId ?? 'brak'}</code></p>
        <p>Brak danych źródłowych, oceny i analizy na tym checkpointcie.</p>
        <div className="action-row">
          <Link className="button-link button-link--secondary" to="/offers">Wróć do ofert</Link>
          <Link className="button-link" to={`${offerPath}/message`}>Przejdź do wiadomości</Link>
        </div>
      </div>
    </section>
  )
}

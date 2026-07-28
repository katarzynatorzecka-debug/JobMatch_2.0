import { Link, useParams } from 'react-router-dom'

export function MessageGeneratorPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const offerPath = `/offers/${offerId ?? 'demo-offer'}`

  return (
    <section className="page">
      <p className="eyebrow">Przyszły etap</p>
      <h1>Generator wiadomości</h1>
      <p className="page-intro">W tym miejscu w przyszłości powstanie wiadomość dotycząca wybranej oferty.</p>
      <div className="placeholder-card">
        <h2>Kontekst demonstracyjny</h2>
        <p>Identyfikator demonstracyjny oferty: <code>{offerId ?? 'brak'}</code></p>
        <p>Generator, edycja, wybór tonu i kopiowanie nie są jeszcze dostępne.</p>
        <div className="action-row">
          <Link className="button-link button-link--secondary" to={offerPath}>Wróć do szczegółów</Link>
          <Link className="button-link" to="/offers">Wróć do ofert</Link>
        </div>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'

const placeholderCards = ['Oferta demonstracyjna A', 'Oferta demonstracyjna B', 'Oferta demonstracyjna C']

export function OffersPage() {
  return (
    <section className="page">
      <p className="eyebrow">Widok demonstracyjny</p>
      <h1>Lista ofert</h1>
      <p className="page-intro">Tutaj pojawi się uporządkowana lista ofert do sprawdzenia.</p>
      <div className="placeholder-list" aria-label="Przykładowe placeholdery ofert">
        {placeholderCards.map((title, index) => (
          <article className="placeholder-card offer-card" key={title}>
            <h2>{title}</h2>
            <p>Placeholder {index + 1} — bez danych, oceny ani analizy.</p>
            {index === 0 ? (
              <Link className="text-link" to="/offers/demo-offer">Zobacz szczegóły</Link>
            ) : (
              <span className="muted-text">Szczegóły zostaną dostępne w kolejnym etapie.</span>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

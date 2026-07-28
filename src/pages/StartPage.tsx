import { Link } from 'react-router-dom'

export function StartPage() {
  return (
    <section className="page">
      <p className="eyebrow">Checkpoint 1</p>
      <h1>Start</h1>
      <p className="page-intro">JobMatch pomaga wybrać oferty pracy warte Twojej uwagi.</p>
      <div className="placeholder-card">
        <h2>Od czego zaczynamy?</h2>
        <p>W kolejnych etapach przygotujesz informacje potrzebne do porządkowania ofert.</p>
        <Link className="button-link" to="/profile">Przejdź do profilu</Link>
      </div>
    </section>
  )
}

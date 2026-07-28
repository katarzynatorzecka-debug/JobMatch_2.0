import { Link } from 'react-router-dom'

export function ImportAnalysisPage() {
  return (
    <section className="page">
      <p className="eyebrow">Przyszły etap</p>
      <h1>Import i analiza</h1>
      <p className="page-intro">Import oraz analiza będą działać jako jeden ekran wielostanowy.</p>
      <div className="placeholder-card">
        <h2>Przestrzeń na rozpoznane oferty</h2>
        <p>Analiza będzie uruchamiana ręcznie po podsumowaniu rozpoznanych ofert.</p>
        <div className="action-row">
          <Link className="button-link button-link--secondary" to="/profile">Wróć do profilu</Link>
          <Link className="button-link" to="/offers">Zobacz oferty</Link>
        </div>
      </div>
    </section>
  )
}

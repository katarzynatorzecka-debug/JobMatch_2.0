import { Link } from 'react-router-dom'

export function ProfilePage() {
  return (
    <section className="page">
      <p className="eyebrow">Przyszły etap</p>
      <h1>Profil użytkownika</h1>
      <p className="page-intro">W kolejnych checkpointach pojawi się ręcznie uzupełniany profil.</p>
      <div className="placeholder-card">
        <h2>Miejsce na informacje o profilu</h2>
        <p>Ten obszar będzie później wspierał dopasowanie ofert do Twoich preferencji.</p>
        <div className="action-row">
          <Link className="button-link button-link--secondary" to="/">Wróć do startu</Link>
          <Link className="button-link" to="/import">Przejdź do importu</Link>
        </div>
      </div>
    </section>
  )
}

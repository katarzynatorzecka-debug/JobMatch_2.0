import { PrimaryLink, SecondaryLink, SectionCard } from '../components/ui'

const flow = ['Profil', 'Raport .eml', 'Analiza', 'Wyniki', 'Wiadomość']

export function StartPage() {
  return (
    <section className="page page--start">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">JobMatch</p>
          <h1>Wybieraj oferty warte Twojej uwagi.</h1>
          <p className="page-intro">Dodaj CV, a JobMatch lokalnie przygotuje większość profilu. Odpowiesz tylko na brakujące pytania i zawsze poprawisz wynik przed zapisem.</p>
          <div className="action-row"><PrimaryLink to="/profile?mode=cv">Dodaj CV i utwórz profil</PrimaryLink><SecondaryLink to="/profile?mode=manual">Uzupełnij profil ręcznie</SecondaryLink></div>
        </div>
        <SectionCard className="hero-result">
          <p className="card-kicker">Po przejściu przez flow</p>
          <h2>Otrzymasz czytelną listę ofert</h2>
          <p>Najpierw powstanie profil do sprawdzenia, a potem czytelna lista ofert z pomocniczą oceną i ryzykiem.</p>
        </SectionCard>
      </div>
      <SectionCard title="Prosty proces, decyzja zawsze po Twojej stronie" className="flow-card">
        <ol className="flow-steps">{flow.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
        <p className="quiet-note">CV jest odczytywane lokalnie w przeglądarce. Analiza ofert rozpocznie się dopiero, gdy uruchomisz ją ręcznie.</p>
      </SectionCard>
    </section>
  )
}

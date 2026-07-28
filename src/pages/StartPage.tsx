import { PrimaryLink, SectionCard } from '../components/ui'

const flow = ['Profil', 'Raport .eml', 'Analiza', 'Wyniki', 'Wiadomość']

export function StartPage() {
  return (
    <section className="page page--start">
      <div className="hero-grid">
        <div>
          <p className="eyebrow">JobMatch</p>
          <h1>Wybieraj oferty warte Twojej uwagi.</h1>
          <p className="page-intro">JobMatch pomaga uporządkować raport ofert, spojrzeć na nie przez pryzmat Twojego profilu i zdecydować, którym pozycjom poświęcić czas.</p>
          <div className="action-row"><PrimaryLink to="/profile">Utwórz profil</PrimaryLink></div>
        </div>
        <SectionCard className="hero-result">
          <p className="card-kicker">Po przejściu przez flow</p>
          <h2>Otrzymasz czytelną listę ofert</h2>
          <p>Każda karta pokaże pomocniczą ocenę, ryzyko i informację, których danych brakuje.</p>
        </SectionCard>
      </div>
      <SectionCard title="Prosty proces, decyzja zawsze po Twojej stronie" className="flow-card">
        <ol className="flow-steps">{flow.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
        <p className="quiet-note">Najpierw zobaczysz rozpoznane oferty. Analiza rozpocznie się dopiero, gdy uruchomisz ją ręcznie.</p>
      </SectionCard>
    </section>
  )
}

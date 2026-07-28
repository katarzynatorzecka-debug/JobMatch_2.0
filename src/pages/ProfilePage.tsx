import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'

const defaultPriorities = ['Doświadczenie', 'Umiejętności', 'Preferencje', 'Rozwój']

export function ProfilePage() {
  const navigate = useNavigate()
  const [role, setRole] = useState('Specjalistka BI i automatyzacji')
  const [alternativeRoles, setAlternativeRoles] = useState('Operations Specialist, Automation Specialist')
  const [experience, setExperience] = useState('Rozwijam dashboardy, automatyzacje procesów i uporządkowane przepływy danych.')
  const [skills, setSkills] = useState('Google Sheets, Looker Studio, automatyzacja, analiza danych')
  const [locations, setLocations] = useState('Kraków, Warszawa, zdalnie')
  const [salary, setSalary] = useState('')
  const [mustHave, setMustHave] = useState('Praca zdalna, automatyzacja lub BI')
  const [blacklist, setBlacklist] = useState('Sprzedaż bez pracy z danymi')
  const [remote, setRemote] = useState(true)
  const [hybrid, setHybrid] = useState(false)
  const [b2b, setB2b] = useState(true)
  const [employment, setEmployment] = useState(false)
  const [student, setStudent] = useState(false)
  const [priorities, setPriorities] = useState(defaultPriorities)
  const [saved, setSaved] = useState(false)

  const movePriority = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= priorities.length) return
    const next = [...priorities]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPriorities(next)
  }
  const completeness = [role, experience, skills, locations, mustHave, blacklist, remote || hybrid, b2b || employment].filter(Boolean).length

  return <section className="page">
    <PageHeader eyebrow="Profil demonstracyjny" title="Twój profil zawodowy" intro="Uzupełnij informacje, które w przyszłości pomogą ocenić oferty. W Checkpoincie 2 dane działają wyłącznie lokalnie w tym widoku." />
    {saved && <Alert title="Profil gotowy" tone="success">Zmiany są widoczne w demonstracyjnym flow tej sesji.</Alert>}
    <div className="two-column-layout">
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); setSaved(true); navigate('/import') }}>
        <SectionCard title="1. Kierunek zawodowy"><div className="field-grid"><label>Rola główna<input value={role} onChange={(event) => setRole(event.target.value)} /></label><label>Role alternatywne<input value={alternativeRoles} onChange={(event) => setAlternativeRoles(event.target.value)} /></label></div></SectionCard>
        <SectionCard title="2. Doświadczenie"><label>Podsumowanie doświadczenia<textarea rows={4} value={experience} onChange={(event) => setExperience(event.target.value)} /></label></SectionCard>
        <SectionCard title="3. Umiejętności"><label>Umiejętności <span className="field-hint">oddziel przecinkami</span><textarea rows={3} value={skills} onChange={(event) => setSkills(event.target.value)} /></label></SectionCard>
        <SectionCard title="4. Preferencje"><div className="field-grid"><label>Preferowane lokalizacje<input value={locations} onChange={(event) => setLocations(event.target.value)} /></label><label>Minimum wynagrodzenia <span className="field-hint">opcjonalnie</span><input value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="np. 120 PLN/h" /></label></div><fieldset><legend>Akceptowane tryby pracy</legend><label className="checkbox-label"><input type="checkbox" checked={remote} onChange={(event) => setRemote(event.target.checked)} />Zdalnie</label><label className="checkbox-label"><input type="checkbox" checked={hybrid} onChange={(event) => setHybrid(event.target.checked)} />Hybrydowo</label></fieldset><fieldset><legend>Akceptowane typy umowy</legend><label className="checkbox-label"><input type="checkbox" checked={b2b} onChange={(event) => setB2b(event.target.checked)} />B2B</label><label className="checkbox-label"><input type="checkbox" checked={employment} onChange={(event) => setEmployment(event.target.checked)} />Umowa o pracę</label><label className="checkbox-label"><input type="checkbox" checked={student} onChange={(event) => setStudent(event.target.checked)} />Mogę korzystać ze statusu studenta</label></fieldset></SectionCard>
        <SectionCard title="5. Kryteria"><label>Must-have<textarea rows={2} value={mustHave} onChange={(event) => setMustHave(event.target.value)} /></label><label>Blacklista lub wykluczone warunki<textarea rows={2} value={blacklist} onChange={(event) => setBlacklist(event.target.value)} /></label></SectionCard>
        <SectionCard title="6. Priorytety"><p className="field-hint">Kolejność można zmienić lokalnie — bez zapisywania danych.</p><ol className="priority-list">{priorities.map((item, index) => <li key={item}><span>{index + 1}. {item}</span><span><button type="button" onClick={() => movePriority(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => movePriority(index, 1)} disabled={index === priorities.length - 1}>↓</button></span></li>)}</ol></SectionCard>
        <div className="action-row"><SecondaryButton type="button" onClick={() => navigate('/')}>Anuluj</SecondaryButton><PrimaryButton type="submit">Zapisz i przejdź do importu</PrimaryButton></div>
      </form>
      <aside className="profile-summary"><SectionCard title="Podsumowanie profilu"><p className="summary-role">{role || 'Brak roli głównej'}</p><dl><div><dt>Umiejętności</dt><dd>{skills ? skills.split(',').filter(Boolean).length : 0}</dd></div><div><dt>Tryb pracy</dt><dd>{[remote && 'zdalnie', hybrid && 'hybrydowo'].filter(Boolean).join(', ') || 'brak'}</dd></div><div><dt>Umowy</dt><dd>{[b2b && 'B2B', employment && 'UoP'].filter(Boolean).join(', ') || 'brak'}</dd></div></dl><div className="completion"><span>Gotowość profilu</span><strong>{completeness}/8 sekcji</strong><div className="progress-track"><span style={{ width: `${(completeness / 8) * 100}%` }} /></div></div></SectionCard></aside>
    </div>
  </section>
}

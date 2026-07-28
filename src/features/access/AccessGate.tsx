import { useState, type FormEvent } from 'react'
import { useAppMode } from './AppModeProvider'
import { supabase } from '../supabase/client'

export function AccessGate() {
  const { configured, enterDemo } = useAppMode()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    const result = register
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    setMessage(result.error ? 'Nie udało się wykonać tej operacji. Sprawdź dane i spróbuj ponownie.' : register ? 'Sprawdź skrzynkę e-mail, aby potwierdzić konto.' : '')
  }

  return <main className="access-gate">
    <section className="access-gate__hero">
      <p className="eyebrow">JobMatch</p>
      <h1>Nie każda oferta zasługuje na Twój czas.</h1>
      <p>JobMatch analizuje raporty z ofertami, porównuje je z Twoim profilem i pomaga skupić się na tych, które naprawdę warto sprawdzić.</p>
      <ul><li>Twój profil — CV i preferencje w jednym miejscu</li><li>Mniej ręcznej selekcji — raport zamienia się w uporządkowaną listę</li><li>Lepszy następny krok — status i powody w jednym miejscu</li></ul>
    </section>
    <section className="access-gate__panel">
      <h2>{register ? 'Załóż konto' : 'Zaloguj się'}</h2>
      {!configured && <p className="import-warning">Konfiguracja konta nie jest jeszcze dostępna. Możesz bezpiecznie użyć demo.</p>}
      {configured && <form onSubmit={submit}>
        <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
        <label>Hasło<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={register ? 'new-password' : 'current-password'} required /></label>
        {message && <p className="import-warning">{message}</p>}
        <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Chwila…' : register ? 'Utwórz konto' : 'Zaloguj się'}</button>
        <button className="text-action" type="button" onClick={() => setRegister(!register)}>{register ? 'Mam już konto' : 'Załóż konto'}</button>
      </form>}
      <hr />
      <h3>Chcesz najpierw zobaczyć, jak to działa?</h3>
      <p>Wersja demo nie wymaga rejestracji i zapisuje dane lokalnie.</p>
      <button className="button button--secondary" type="button" onClick={enterDemo}>Wypróbuj JobMatch</button>
    </section>
  </main>
}

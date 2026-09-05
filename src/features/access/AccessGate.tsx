import { useState, type FormEvent } from 'react'
import { useAppMode } from './AppModeProvider'
import { supabase } from '../supabase/client'
import { isAuthSessionRemembered, setRememberedAuthSession } from '../supabase/authSessionStorage'

export function AccessGate() {
  const { configured, enterDemo } = useAppMode()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [rememberSession, setRememberSession] = useState(isAuthSessionRemembered)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setRememberedAuthSession(!register && rememberSession)
    const result = register
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    setMessage(result.error ? 'Nie udało się wykonać tej operacji. Sprawdź dane i spróbuj ponownie.' : register ? 'Sprawdź skrzynkę e-mail, aby potwierdzić konto.' : '')
  }

  return <main className="access-gate">
    <section className="access-gate__hero">
      <img className="brand-logo brand-logo--access" src="/assets/jobmatch-logo.png" alt="JobMatch" width="251" height="45" />
      <h1><span>Nie każda oferta</span><span>zasługuje na Twój</span><span>czas.</span></h1>
      <p>JobMatch pomaga uporządkować oferty, sprawdzić ich dopasowanie do Twojego profilu i skupić się na tych, które naprawdę warto rozważyć.</p>
      <ol className="access-gate__steps"><li>Dodaj CV i uzupełnij profil.</li><li>Zaimportuj raport ofert.</li><li>Sprawdź dopasowanie i wybierz najlepsze oferty.</li></ol>
    </section>
      <div className="access-gate__right-column">
        <section className="access-gate__panel">
        <h2>{register ? 'Załóż konto' : 'Zaloguj się'}</h2>
        {!configured && <p className="import-warning">Konfiguracja konta nie jest jeszcze dostępna. Możesz bezpiecznie użyć demo.</p>}
        {configured && <form onSubmit={submit}>
          <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
          <label>Hasło<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={register ? 'new-password' : 'current-password'} required /></label>
          {!register && <label className="remember-session"><input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} /><span>Zapamiętaj mnie na tym urządzeniu</span></label>}
          {!register && <p className="field-hint remember-session__hint">Bez zaznaczenia konto pozostanie zalogowane tylko do zamknięcia przeglądarki.</p>}
          {message && <p className="import-warning">{message}</p>}
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Chwila…' : register ? 'Utwórz konto' : 'Zaloguj się'}</button>
          <button className="text-action" type="button" onClick={() => setRegister(!register)}>{register ? 'Mam już konto' : 'Załóż konto'}</button>
        </form>}
        <hr />
        <h3>Chcesz najpierw zobaczyć, jak to działa?</h3>
        <p>Wersja demo nie wymaga rejestracji i zapisuje dane lokalnie.</p>
          <button className="button button--secondary" type="button" onClick={enterDemo}>Wypróbuj JobMatch</button>
        </section>
      </div>
  </main>
}

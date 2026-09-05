import { useState, type FormEvent } from 'react'
import { useAppMode } from './AppModeProvider'
import { supabase } from '../supabase/client'
import { isAuthSessionRemembered, setRememberedAuthSession } from '../supabase/authSessionStorage'
import { LanguageToggle } from '../../components/LanguageToggle'
import { useI18n } from '../../i18n/I18nProvider'

export function AccessGate() {
  const { configured, enterDemo } = useAppMode()
  const { t } = useI18n()
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
    setMessage(result.error ? t('auth.operationError') : register ? t('auth.confirmEmail') : '')
  }

  return <main className="access-gate">
    <div className="access-gate__language-toggle"><LanguageToggle /></div>
    <section className="access-gate__hero">
      <img className="brand-logo brand-logo--access" src="/assets/jobmatch-logo.png" alt="JobMatch" width="251" height="45" />
      <h1><span>{t('auth.hero.line1')}</span><span>{t('auth.hero.line2')}</span><span>{t('auth.hero.line3')}</span></h1>
      <p>{t('auth.hero.description')}</p>
      <ol className="access-gate__steps"><li>{t('auth.hero.stepProfile')}</li><li>{t('auth.hero.stepImport')}</li><li>{t('auth.hero.stepReview')}</li></ol>
    </section>
      <div className="access-gate__right-column">
        <section className="access-gate__panel">
        <h2>{register ? t('auth.heading.register') : t('auth.heading.signIn')}</h2>
        {!configured && <p className="import-warning">{t('auth.configurationUnavailable')}</p>}
        {configured && <form onSubmit={submit}>
          <label>{t('auth.field.email')}<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
          <label>{t('auth.field.password')}<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={register ? 'new-password' : 'current-password'} required /></label>
          {!register && <label className="remember-session"><input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} /><span>{t('auth.remember')}</span></label>}
          {!register && <p className="field-hint remember-session__hint">{t('auth.rememberHint')}</p>}
          {message && <p className="import-warning">{message}</p>}
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? t('auth.busy') : register ? t('auth.action.createAccount') : t('auth.action.signIn')}</button>
          <button className="text-action" type="button" onClick={() => setRegister(!register)}>{register ? t('auth.action.haveAccount') : t('auth.action.openRegistration')}</button>
        </form>}
        <hr />
        <h3>{t('auth.demo.heading')}</h3>
        <p>{t('auth.demo.description')}</p>
          <button className="button button--secondary" type="button" onClick={enterDemo}>{t('auth.demo.action')}</button>
        </section>
      </div>
  </main>
}

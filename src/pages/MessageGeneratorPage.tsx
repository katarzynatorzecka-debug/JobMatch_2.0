import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { findDemoOffer } from '../demo/offers'

type Tone = 'Naturalny' | 'Formalny' | 'Bezpośredni'
const toneIntroductions: Record<Tone, string> = { Naturalny: 'Dzień dobry,\n\nzainteresowała mnie oferta', Formalny: 'Szanowni Państwo,\n\nchciałabym wyrazić zainteresowanie ofertą', Bezpośredni: 'Dzień dobry,\n\npiszę w sprawie oferty' }

function createMessage(tone: Tone, title: string, company: string) {
  return `${toneIntroductions[tone]} „${title}” w ${company}.\n\nDoświadczenie w pracy z danymi, automatyzacją i uporządkowanymi procesami chciałabym wykorzystać w tym obszarze. Chętnie opowiem, jak podchodzę do budowania praktycznych rozwiązań dla zespołów.\n\nPozdrawiam,\n[Twoje imię]`
}

export function MessageGeneratorPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const offer = findDemoOffer(offerId)
  const [tone, setTone] = useState<Tone>('Naturalny')
  const [message, setMessage] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const [hasManualEdit, setHasManualEdit] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  if (!offer) return <Navigate to="/offers" replace />
  const generate = () => { setMessage(createMessage(tone, offer.title, offer.company)); setCopyState('idle'); setHasManualEdit(false); setConfirmRegenerate(false) }
  const requestGenerate = () => { if (message && hasManualEdit) setConfirmRegenerate(true); else generate() }
  const copy = async () => { try { if (!navigator.clipboard) throw new Error('Brak Clipboard API'); await navigator.clipboard.writeText(message); setCopyState('success') } catch { setCopyState('error') } }
  return <section className="page page--message"><Link className="back-link" to={`/offers/${offer.id}`}>← Wróć do szczegółów</Link><PageHeader eyebrow="Wiadomość demonstracyjna" title="Napisz do pracodawcy" intro={`${offer.title} · ${offer.company}`} />
    <SectionCard className="message-context"><strong>Oferta:</strong><span>{offer.title}</span><strong>Firma:</strong><span>{offer.company}</span></SectionCard>
    <SectionCard title="Wybierz ton"><fieldset className="tone-selector"><legend className="sr-only">Ton wiadomości</legend>{(['Naturalny', 'Formalny', 'Bezpośredni'] as Tone[]).map((option) => <label key={option}><input type="radio" name="tone" value={option} checked={tone === option} onChange={() => setTone(option)} />{option}</label>)}</fieldset><PrimaryButton onClick={requestGenerate}>{message ? 'Wygeneruj ponownie' : 'Wygeneruj wiadomość'}</PrimaryButton></SectionCard>
    <SectionCard title="Treść wiadomości"><label className="sr-only" htmlFor="generated-message">Edytowalna treść wiadomości</label><textarea id="generated-message" className="message-editor" rows={11} value={message} onChange={(event) => { setMessage(event.target.value); setHasManualEdit(true); setCopyState('idle') }} placeholder="Wygeneruj wiadomość lub wpisz własną treść." /><div className="editor-footer"><span>{message.length} znaków</span><PrimaryButton onClick={copy} disabled={!message}>{copyState === 'success' ? 'Skopiowano' : 'Kopiuj wiadomość'}</PrimaryButton></div>{confirmRegenerate && <Alert title="Zastąpić ręczne zmiany?" tone="warning">Wprowadzone poprawki zostaną nadpisane nową wersją demonstracyjną.<div className="action-row"><SecondaryButton onClick={() => setConfirmRegenerate(false)}>Zachowaj obecną treść</SecondaryButton><PrimaryButton onClick={generate}>Zastąp wiadomość</PrimaryButton></div></Alert>}{copyState === 'success' && <Alert title="Wiadomość skopiowana" tone="success">Możesz wkleić ją w wybranym miejscu.</Alert>}{copyState === 'error' && <Alert title="Nie udało się skopiować wiadomości" tone="warning">Zaznacz i skopiuj tekst ręcznie — przeglądarka nie udostępniła schowka.</Alert>}{!message && <p className="field-hint">Wpisz lub wygeneruj treść wiadomości.</p>}</SectionCard>
    <div className="action-row"><SecondaryButton onClick={() => setMessage('')}>Wyczyść treść</SecondaryButton><Link className="button button--secondary" to="/offers">Wróć do listy ofert</Link></div>
  </section>
}

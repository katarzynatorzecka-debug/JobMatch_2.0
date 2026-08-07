import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import type { UserProfile } from '../contracts/profile'
import type { ProfilePresentationMetadata } from '../contracts/profilePresentation'
import { useAppMode } from '../features/access/AppModeProvider'
import { localProfileRepository, supabaseProfileRepository } from '../features/supabase/repositories'
import { workspaceRepositoryFor } from '../features/workspace/workspaceService'
import type { WorkspaceJobOffer } from '../contracts/workspace'
import { createMessage, type MessageTone } from '../features/message/messageGenerator'

type GeneratorContext = { offer: WorkspaceJobOffer; profile: UserProfile; analysis: JobAnalysis | null; presentation: ProfilePresentationMetadata }

export function MessageGeneratorPage() {
  const { offerId } = useParams<{ offerId: string }>()
  const { mode, session } = useAppMode()
  const [context, setContext] = useState<GeneratorContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tone, setTone] = useState<MessageTone>('Naturalny')
  const [message, setMessage] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const [hasManualEdit, setHasManualEdit] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [generationError, setGenerationError] = useState('')

  useEffect(() => {
    if (!mode || !offerId) return
    let active = true
    setLoading(true); setError('')
    const repository = workspaceRepositoryFor(mode, session?.user)
    const profileRepository = mode === 'authenticated' && session ? supabaseProfileRepository(session.user) : localProfileRepository
    void Promise.all([repository.loadOfferDetails(offerId), profileRepository.load()]).then(([details, profileResult]) => {
      if (!active) return
      if (!details.offer || !details.listItem) throw new Error('Nie znaleziono canonical oferty.')
      if (!profileResult.data) throw new Error(profileResult.error ?? 'Najpierw zapisz profil użytkownika.')
      setContext({ offer: details.offer, profile: profileResult.data, analysis: details.listItem.analysis, presentation: profileResult.presentation })
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Nie udało się przygotować generatora wiadomości.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [mode, offerId, session])

  if (loading) return <section className="page page--message" aria-busy="true"><PageHeader eyebrow="Wiadomość" title="Przygotowujemy generator" intro="Odtwarzamy ofertę i profil użytkownika." /><div className="details-skeleton" role="status" aria-label="Ładowanie generatora"><div /><div /><div /></div></section>
  if (error || !context || !offerId) return <section className="page page--message"><Alert title="Nie udało się otworzyć generatora" tone="warning">{error || 'Brak canonical kontekstu oferty.'}</Alert><Link className="button button--secondary" to={offerId ? `/offers/${offerId}` : '/offers'}>Wróć do szczegółów</Link></section>

  const generate = () => {
    try { setGenerationError(''); setMessage(createMessage(tone, context.offer, context.profile, context.analysis)); setCopyState('idle'); setHasManualEdit(false); setConfirmRegenerate(false) }
    catch { setGenerationError('Nie udało się wygenerować wiadomości. Poprzednia treść pozostała bez zmian.') }
  }
  const requestGenerate = () => { if (message && hasManualEdit) setConfirmRegenerate(true); else generate() }
  const copy = async () => { try { if (!navigator.clipboard) throw new Error('Brak Clipboard API'); await navigator.clipboard.writeText(message); setCopyState('success') } catch { setCopyState('error') } }

  return <section className="page page--message"><Link className="back-link" to={`/offers/${context.offer.id}`}>← Wróć do szczegółów</Link><PageHeader eyebrow="Wiadomość do pracodawcy" title="Napisz do pracodawcy" intro={`${context.offer.title} · ${context.offer.company}`} />
    <SectionCard className="message-context"><strong>Oferta:</strong><span>{context.offer.title}</span><strong>Firma:</strong><span>{context.offer.company}</span>{context.analysis && <><strong>Aktualna analiza:</strong><span>{context.analysis.recommendation}</span></>}</SectionCard>
    <SectionCard title="Wybierz ton"><fieldset className="tone-selector"><legend className="sr-only">Ton wiadomości</legend>{(['Naturalny', 'Formalny', 'Bezpośredni'] as MessageTone[]).map((option) => <label key={option}><input type="radio" name="tone" value={option} checked={tone === option} onChange={() => setTone(option)} />{option}</label>)}</fieldset><PrimaryButton onClick={requestGenerate}>{message ? 'Wygeneruj ponownie' : 'Wygeneruj wiadomość'}</PrimaryButton></SectionCard>
    <SectionCard title="Treść wiadomości"><label className="sr-only" htmlFor="generated-message">Edytowalna treść wiadomości</label><textarea id="generated-message" className="message-editor" rows={11} value={message} onChange={(event) => { setMessage(event.target.value); setHasManualEdit(true); setCopyState('idle') }} placeholder="Wygeneruj wiadomość lub wpisz własną treść." /><div className="editor-footer"><span>{message.length} znaków</span><PrimaryButton onClick={copy} disabled={!message}>{copyState === 'success' ? 'Skopiowano' : 'Kopiuj wiadomość'}</PrimaryButton></div>{generationError && <Alert title="Błąd generowania" tone="warning">{generationError}</Alert>}{confirmRegenerate && <Alert title="Zastąpić ręczne zmiany?" tone="warning">Wprowadzone poprawki zostaną nadpisane nową treścią opartą na aktualnych danych.<div className="action-row"><SecondaryButton onClick={() => setConfirmRegenerate(false)}>Zachowaj obecną treść</SecondaryButton><PrimaryButton onClick={generate}>Zastąp wiadomość</PrimaryButton></div></Alert>}{copyState === 'success' && <Alert title="Wiadomość skopiowana" tone="success">Możesz wkleić ją w wybranym miejscu.</Alert>}{copyState === 'error' && <Alert title="Nie udało się skopiować wiadomości" tone="warning">Zaznacz i skopiuj tekst ręcznie.</Alert>}{!message && <p className="field-hint">Wpisz lub wygeneruj treść wiadomości.</p>}</SectionCard>
    <div className="action-row"><SecondaryButton onClick={() => setMessage('')}>Wyczyść treść</SecondaryButton><Link className="button button--secondary" to="/offers">Wróć do listy ofert</Link></div>
  </section>
}
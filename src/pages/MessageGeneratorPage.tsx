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
import { useI18n } from '../i18n/I18nProvider'

type GeneratorContext = { offer: WorkspaceJobOffer; profile: UserProfile; analysis: JobAnalysis | null; presentation: ProfilePresentationMetadata }

export function MessageGeneratorPage() {
  const { t } = useI18n()
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
      if (!details.offer || !details.listItem) throw new Error(t('message.error.offerMissing'))
      if (!profileResult.data) throw new Error(profileResult.error ?? t('message.error.profileMissing'))
      setContext({ offer: details.offer, profile: profileResult.data, analysis: details.listItem.analysis, presentation: profileResult.presentation })
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t('message.error.prepare')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [mode, offerId, session])

  if (loading) return <section className="page page--loading-surface" aria-busy="true"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only" role="status">{t('message.loading')}</span></section>
  if (error || !context || !offerId) return <section className="page page--message"><Alert title={t('message.error.openTitle')} tone="warning">{error || t('message.error.contextMissing')}</Alert><Link className="button button--secondary" to={offerId ? `/offers/${offerId}` : '/offers'}>{t('message.backDetails')}</Link></section>

  const generate = () => {
    try { setGenerationError(''); setMessage(createMessage(tone, context.offer, context.profile, context.analysis)); setCopyState('idle'); setHasManualEdit(false); setConfirmRegenerate(false) }
    catch { setGenerationError(t('message.error.generate')) }
  }
  const requestGenerate = () => { if (message && hasManualEdit) setConfirmRegenerate(true); else generate() }
  const copy = async () => { try { if (!navigator.clipboard) throw new Error('Brak Clipboard API'); await navigator.clipboard.writeText(message); setCopyState('success') } catch { setCopyState('error') } }

  const toneLabels: Record<MessageTone, string> = { Naturalny: t('message.tone.natural'), Formalny: t('message.tone.formal'), Bezpośredni: t('message.tone.direct') }
  return <section className="page page--message"><Link className="back-link" to={`/offers/${context.offer.id}`}>← {t('message.backDetails')}</Link><PageHeader eyebrow={t('message.header.eyebrow')} title={t('message.header.title')} intro={`${context.offer.title} · ${context.offer.company}`} />
    <SectionCard className="message-context"><strong>{t('message.field.offer')}</strong><span>{context.offer.title}</span><strong>{t('message.field.company')}</strong><span>{context.offer.company}</span>{context.analysis && <><strong>{t('message.field.currentAnalysis')}</strong><span>{context.analysis.recommendation}</span></>}</SectionCard>
    <SectionCard title={t('message.tone.section')}><fieldset className="tone-selector"><legend className="sr-only">{t('message.tone.legend')}</legend>{(['Naturalny', 'Formalny', 'Bezpośredni'] as MessageTone[]).map((option) => <label key={option}><input type="radio" name="tone" value={option} checked={tone === option} onChange={() => setTone(option)} />{toneLabels[option]}</label>)}</fieldset><PrimaryButton onClick={requestGenerate}>{message ? t('message.action.regenerate') : t('message.action.generate')}</PrimaryButton></SectionCard>
    <SectionCard title={t('message.content.section')}><label className="sr-only" htmlFor="generated-message">{t('message.content.label')}</label><textarea id="generated-message" className="message-editor" rows={11} value={message} onChange={(event) => { setMessage(event.target.value); setHasManualEdit(true); setCopyState('idle') }} placeholder={t('message.content.placeholder')} /><div className="editor-footer"><span>{t('message.content.characters', { count: message.length })}</span><PrimaryButton onClick={copy} disabled={!message}>{copyState === 'success' ? t('message.action.copied') : t('message.action.copy')}</PrimaryButton></div>{generationError && <Alert title={t('message.error.generationTitle')} tone="warning">{generationError}</Alert>}{confirmRegenerate && <Alert title={t('message.confirm.title')} tone="warning">{t('message.confirm.copy')}<div className="action-row"><SecondaryButton onClick={() => setConfirmRegenerate(false)}>{t('message.confirm.keep')}</SecondaryButton><PrimaryButton onClick={generate}>{t('message.confirm.replace')}</PrimaryButton></div></Alert>}{copyState === 'success' && <Alert title={t('message.copy.successTitle')} tone="success">{t('message.copy.successCopy')}</Alert>}{copyState === 'error' && <Alert title={t('message.copy.errorTitle')} tone="warning">{t('message.copy.errorCopy')}</Alert>}{!message && <p className="field-hint">{t('message.empty')}</p>}</SectionCard>
    <div className="action-row"><SecondaryButton onClick={() => setMessage('')}>{t('message.action.clear')}</SecondaryButton><Link className="button button--secondary" to="/offers">{t('message.action.backOffers')}</Link></div>
  </section>
}

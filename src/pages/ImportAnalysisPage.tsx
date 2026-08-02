import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ImportedReport, ReportImportStatus } from '../contracts/import'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { evaluateOffers } from '../features/hardFilter/hardFilter'
import { clearHardFilterSession, saveHardFilterSession } from '../features/hardFilter/hardFilterSessionStorage'
import { extractEmlContent } from '../features/import/emlExtractor'
import { clearImportedReport, loadImportedReport, saveImportedReport } from '../features/import/importSessionStorage'
import { canStartDemoAnalysis, restoreImportedOffers } from '../features/import/importReviewState'
import { validateEmlFile } from '../features/import/importUtils'
import { parseRocketJobsReport } from '../features/import/rocketJobsReportParser'
import { loadUserProfile } from '../features/profile/profileStorage'
import { useAppMode } from '../features/access/AppModeProvider'
import { supabaseImportRepository, supabaseProfileRepository } from '../features/supabase/repositories'
import { AnalysisOrchestrator, type AnalysisProgress } from '../features/analysis/analysisOrchestrator'
import { AIAnalysisService } from '../features/analysis/analysisService'
import { OfferContentProvider } from '../features/analysis/offerContentProvider'
import { localAnalysisRepository, supabaseAnalysisRepository } from '../features/analysis/analysisRepository'
import { getAnalysisAccess } from '../features/analysis/analysisAccess'
import { OfferContentFetcher } from '../features/offers/offerContentFetcher'
import { localOfferSourceRepository, supabaseOfferSourceRepository } from '../features/offers/offerSourceRepository'

const processingLabels: Record<Extract<ReportImportStatus, 'validating' | 'reading' | 'parsing'>, string> = { validating: 'Sprawdzamy plik', reading: 'Odczytujemy wiadomość EML', parsing: 'Rozpoznajemy oferty RocketJobs' }

export function ImportAnalysisPage() {
  const navigate = useNavigate()
  const { mode, session } = useAppMode()
  const initial = loadImportedReport()
  const [status, setStatus] = useState<ReportImportStatus>(initial.report ? 'review' : 'idle')
  const [report, setReport] = useState<ImportedReport | null>(initial.report)
  const [visibleOfferIds, setVisibleOfferIds] = useState<string[] | null>(null)
  const [message, setMessage] = useState(initial.warning ?? '')
  const [reviewError, setReviewError] = useState('')
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress[]>([])
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [analysisCompleted, setAnalysisCompleted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const visibleOffers = report ? report.offers.filter((offer) => visibleOfferIds === null || visibleOfferIds.includes(offer.id)) : []

  useEffect(() => {
    if (mode !== 'authenticated' || !session) return
    let active = true
    void supabaseImportRepository(session.user).load().then((loaded) => {
      if (!active) return
      if (loaded.data) { setReport(loaded.data); setVisibleOfferIds(null); setStatus('review'); setMessage('') }
      else if (loaded.error) { setMessage(loaded.error); setStatus('error') }
    })
    return () => { active = false }
  }, [mode, session])

  async function handleFile(file: File | null) {
    const validation = validateEmlFile(file)
    if (!validation.valid || !file) { setStatus('error'); setMessage(validation.valid ? 'Wybierz plik raportu.' : validation.error); return }
    setMessage(''); setReviewError(''); setReport(null); setVisibleOfferIds(null); clearHardFilterSession(); setStatus('validating')
    await Promise.resolve(); setStatus('reading')
    const extraction = await extractEmlContent(file)
    if (!extraction.success) { setStatus('error'); setMessage(extraction.error ?? 'Nie udało się odczytać raportu.'); return }
    setStatus('parsing'); await Promise.resolve()
    const parsed = parseRocketJobsReport(extraction.text)
    const nextReport: ImportedReport = { version: 1, source: 'rocketjobs-eml', fileName: file.name, importedAt: new Date().toISOString(), offers: parsed.offers, warnings: parsed.warnings }
    if (!nextReport.offers.length) { clearImportedReport(); setStatus('empty'); setMessage('Nie znaleźliśmy kompletnych ofert RocketJobs w tym raporcie.'); return }
    if (mode === 'authenticated' && session) {
      const saved = await supabaseImportRepository(session.user).save(nextReport)
      if (!saved.data) { setStatus('error'); setMessage(saved.error ?? 'Nie udalo sie zapisac ofert w chmurze.'); return }
      setReport(saved.data); setStatus('review'); return
    }
    setReport(nextReport); saveImportedReport(nextReport); setStatus('review')
  }

  function chooseAnotherFile() { clearImportedReport(); clearHardFilterSession(); setReport(null); setVisibleOfferIds(null); setMessage(''); setReviewError(''); setStatus('idle'); if (inputRef.current) inputRef.current.value = '' }
  function deleteOffer(id: string) { setVisibleOfferIds((current) => (current ?? report?.offers.map((offer) => offer.id) ?? []).filter((offerId) => offerId !== id)) }
  function restoreOffers() { if (report) setVisibleOfferIds(restoreImportedOffers(report.offers).map((offer) => offer.id)) }
  async function startHardFilter(retryOfferId?: string) {
    if (analysisBusy) return
    setReviewError('')
    setAnalysisCompleted(false)
    const cloudProfile = mode === 'authenticated' && session ? await supabaseProfileRepository(session.user).load() : null
    const profileResult = cloudProfile ? { profile: cloudProfile.data, warning: cloudProfile.error } : loadUserProfile()
    if (!profileResult.profile) { setReviewError(profileResult.warning ?? 'Najpierw utwórz i zapisz profil, aby uruchomić Hard Filter.'); return }
    if (!canStartDemoAnalysis(visibleOffers)) { setReviewError('Lista ofert jest pusta. Przywróć oferty albo zaimportuj inny raport.'); return }
    const filteredOffers = evaluateOffers(profileResult.profile, visibleOffers)
    if (!saveHardFilterSession({ version: 1, filteredOffers })) { setReviewError('Nie udało się bezpiecznie zapisać wyniku Hard Filter w tej sesji.'); return }
    const access = getAnalysisAccess(mode, Boolean(session))
    if (!access.allowed) {
      setAnalysisProgress(filteredOffers.map((item) => ({ offerId: item.offer.id, state: item.result.status === 'fail' ? 'rejected' : 'retry', error: access.code })))
      setReviewError(`${access.message} Kod diagnostyczny: ${access.code}.`)
      return
    }
    const itemsToAnalyze = retryOfferId ? filteredOffers.filter((item) => item.offer.id === retryOfferId) : filteredOffers
    if (retryOfferId && !itemsToAnalyze.length) { setReviewError('Nie znaleziono oferty do ponowienia. Kod diagnostyczny: ANALYSIS_NOT_STARTED.'); return }
    setAnalysisProgress((current) => retryOfferId
      ? current.map((item) => item.offerId === retryOfferId ? { offerId: retryOfferId, state: 'queued' } : item)
      : filteredOffers.map((item) => ({ offerId: item.offer.id, state: item.result.status === 'fail' ? 'rejected' : 'queued' })))
    setAnalysisBusy(true)
    const repository = mode === 'authenticated' && session ? supabaseAnalysisRepository(session.user) : localAnalysisRepository
    const sourceRepository = mode === 'authenticated' && session ? supabaseOfferSourceRepository(session.user) : localOfferSourceRepository
    const orchestrator = new AnalysisOrchestrator(new OfferContentProvider(new OfferContentFetcher(), sourceRepository), new AIAnalysisService(), repository)
    try {
      const analyses = await orchestrator.analyzeAll(profileResult.profile, itemsToAnalyze, (progress) => setAnalysisProgress((current) => [...current.filter((item) => item.offerId !== progress.offerId), progress]))
      const eligibleCount = itemsToAnalyze.filter((item) => item.result.status !== 'fail').length
      if (!analyses.length && eligibleCount > 0) { setReviewError('Nie udało się zapisać żadnej analizy. Sprawdź kod przy ofercie i użyj „Ponów”.') }
      else if (analyses.length < eligibleCount) { setReviewError(`Zapisano ${analyses.length} z ${eligibleCount} analiz. Oferty z błędem możesz ponowić.`) }
      setAnalysisCompleted(analyses.length > 0)
    } finally { setAnalysisBusy(false) }
  }

  return <section className="page">
    <PageHeader eyebrow="Raport RocketJobs" title="Import i analiza" intro="Wczytaj lokalny raport .eml, sprawdź rozpoznane oferty, a następnie ręcznie uruchom deterministyczny Hard Filter." />
    <input ref={inputRef} className="sr-only" type="file" accept=".eml,message/rfc822" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
    {analysisProgress.length > 0 && <SectionCard title="Postęp analizy AI"><ul className="analysis-list">{analysisProgress.map((item) => <li key={item.offerId}><span>{item.offerId}</span><span className={`analysis-state analysis-state--${item.state}`}>{item.state === 'queued' ? 'oczekuje' : item.state === 'fetching' ? 'pobieramy źródło' : item.state === 'analyzing' ? 'analizowana' : item.state === 'ready' ? 'gotowa' : item.state === 'rejected' ? 'odrzucona przez Hard Filter' : 'wymaga ponowienia'}{item.sourceQuality ? ` · ${item.sourceQuality === 'full' ? 'Źródło pełne' : item.sourceQuality === 'partial' ? 'Źródło częściowe' : 'Źródło niedostępne'}` : ''}{item.sourceErrorCode ? ` · ${item.sourceErrorCode}` : ''}{item.error ? ` · ${item.error}` : ''}</span>{item.state === 'retry' && mode === 'authenticated' && <SecondaryButton disabled={analysisBusy} onClick={() => void startHardFilter(item.offerId)}>Ponów</SecondaryButton>}</li>)}</ul>{analysisCompleted && <div className="action-row"><PrimaryButton onClick={() => navigate('/offers')}>Zobacz wyniki</PrimaryButton></div>}</SectionCard>}
    {status === 'idle' && <SectionCard className="dropzone-card"><div className="file-dropzone"><span className="dropzone-icon" aria-hidden="true">⇧</span><h2>Dodaj raport w formacie .eml</h2><p>Odczyt nastąpi wyłącznie w tej przeglądarce. Zapisujemy jedynie znormalizowane dane ofert na czas sesji — bez treści EML i nagłówków wiadomości.</p><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz plik</PrimaryButton><span className="field-hint">Format .eml · maksymalnie 10 MB</span></div></SectionCard>}
    {(['validating', 'reading', 'parsing'] as const).includes(status as 'validating') && <SectionCard title="Rozpoznajemy raport"><p className="file-name">{inputRef.current?.files?.[0]?.name ?? 'Wybrany raport'} <span>· lokalne przetwarzanie</span></p><div className="progress-track progress-track--large" aria-label="Postęp importu"><span style={{ width: status === 'validating' ? '22%' : status === 'reading' ? '56%' : '82%' }} /></div><ol className="process-steps"><li className={status !== 'validating' ? 'is-complete' : 'is-active'}>Sprawdzamy plik</li><li className={status === 'parsing' ? 'is-complete' : status === 'reading' ? 'is-active' : ''}>Odczytujemy raport</li><li className={status === 'parsing' ? 'is-active' : ''}>Rozpoznajemy oferty</li></ol><p className="field-hint">{processingLabels[status as keyof typeof processingLabels]}</p></SectionCard>}
    {status === 'error' && <SectionCard title="Nie udało się zaimportować raportu"><Alert title="Import zatrzymany" tone="warning">{message}</Alert><div className="action-row"><SecondaryButton onClick={chooseAnotherFile}>Wróć</SecondaryButton><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz inny plik</PrimaryButton></div></SectionCard>}
    {status === 'empty' && <SectionCard title="Brak ofert do przeglądu"><Alert title="Nie znaleziono kompletnych ofert" tone="warning">{message}</Alert><p>Raport nie został użyty do analizy. Możesz wybrać inny plik lub wrócić później.</p><div className="action-row"><SecondaryButton onClick={chooseAnotherFile}>Wróć</SecondaryButton><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz inny plik</PrimaryButton></div></SectionCard>}
    {status === 'review' && report && <SectionCard title="Rozpoznane oferty"><Alert title="Analiza nie uruchamia się automatycznie" tone="info">Potwierdź listę ofert. Po kliknięciu wykonamy Hard Filter, a po zalogowaniu przygotujemy kolejkę AI z oceną 0–100.</Alert>{reviewError && <Alert title="Nie można ukończyć analizy" tone="warning">{reviewError} <a className="text-link" href="/profile">Przejdź do profilu</a></Alert>}<p className="file-name">{report.fileName} <span>· {visibleOffers.length} z {report.offers.length} ofert</span></p>{report.warnings.map((warning, index) => <p className="import-warning" key={`${warning.code}-${index}`}>{warning.message}</p>)}<ul className="recognized-offers">{visibleOffers.map((offer) => <li key={offer.id}><div><strong>{offer.title}</strong><span>{offer.company}{offer.location ? ` · ${offer.location}` : ''}</span>{offer.missingFields.length > 0 && <small>Brak: {offer.missingFields.join(', ')}</small>}</div><SecondaryButton onClick={() => deleteOffer(offer.id)}>Usuń</SecondaryButton></li>)}</ul>{visibleOffers.length === 0 && <Alert title="Lista jest pusta" tone="warning">Przywróć oferty albo zaimportuj inny raport.</Alert>}<div className="action-row"><SecondaryButton onClick={restoreOffers} disabled={visibleOffers.length === report.offers.length || analysisBusy}>Przywróć listę</SecondaryButton><SecondaryButton onClick={() => inputRef.current?.click()} disabled={analysisBusy}>Wybierz inny plik</SecondaryButton><PrimaryButton disabled={!canStartDemoAnalysis(visibleOffers) || analysisBusy} onClick={() => void startHardFilter()}>{analysisBusy ? 'Analizujemy oferty…' : mode === 'demo' ? 'Uruchom Hard Filter' : 'Analizuj oferty'}</PrimaryButton></div></SectionCard>}
  </section>
}

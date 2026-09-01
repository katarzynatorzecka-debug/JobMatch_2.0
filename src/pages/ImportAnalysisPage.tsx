import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ImportedReport, ImportWarning } from '../contracts/import'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import { Alert, AnalysisQuality, HardFilterStatusBadge, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { useAppMode } from '../features/access/AppModeProvider'
import { type BatchReport, type IntegratedBatchCounts, type IntegratedOfferProgress, retryIntegratedOffer, runIntegratedAnalysisBatch } from '../features/analysis/integratedAnalysisFlow'
import { clearIntegratedAnalysisSession, loadIntegratedAnalysisSession, saveIntegratedAnalysisSession } from '../features/analysis/integratedAnalysisSession'
import { restoreActiveWorkspaceImport, shouldResetTerminalBatchForNewFiles, shouldRestoreWorkspaceImport } from '../features/analysis/restoredWorkspaceImport'
import { scoreBand } from '../features/analysis/deterministicScoring'
import { extractEmlContent } from '../features/import/emlExtractor'
import { appendBatchEntries, createImportBatchId, createImportBatchState, hasRemovedOffers, removeBatchOffer, removeBatchReport, restoreBatchOffers, summarizeBatch, visibleOffers, type ImportBatchEntry } from '../features/import/importBatchState'
import { validateEmlFile } from '../features/import/importUtils'
import { parseRocketJobsReport } from '../features/import/rocketJobsReportParser'
import { presentOfferIssues } from '../features/import/offerIssuePresentation'
import { createUrlOfferSeed, importedReportFromUrlSource, normalizeOfferUrl } from '../features/import/urlOfferImport'
import { OfferContentFetcher, OfferSourceError } from '../features/offers/offerContentFetcher'
import { loadUserProfile } from '../features/profile/profileStorage'
import { supabaseProfileRepository } from '../features/supabase/repositories'
import { workspaceRepositoryFor } from '../features/workspace/workspaceService'
import { createDemoSampleReport } from '../demo/demoSampleData'

const processingLabels = { adding_files: 'Przygotowujemy wybrane pliki.', reading: 'Odczytujemy wiadomości EML lokalnie w przeglądarce.', parsing: 'Rozpoznajemy oferty RocketJobs i pola wymagające sprawdzenia.' } as const
const emptyCounts: IntegratedBatchCounts = { total: 0, hardFilterRejected: 0, queued: 0, processing: 0, completed: 0, failed: 0 }
type PipelineState = 'idle' | 'running' | 'complete' | 'partial_complete'

function parserWarnings(warnings: string[]): ImportWarning[] { return warnings.map((message) => ({ code: 'partial-parse' as const, message })) }
function progressKey(reportId: string, offerId: string) { return `${reportId}:${offerId}` }
function hardFilterLabel(status?: 'pass' | 'weak' | 'fail') { return status === 'pass' ? 'Przechodzi' : status === 'weak' ? 'Wymaga sprawdzenia' : status === 'fail' ? 'Odrzucona przez Hard Filter' : null }
function statusLabel(progress?: IntegratedOfferProgress) {
  if (!progress) return 'Oczekuje'
  return ({ waiting: 'Oczekuje', hard_filtering: 'Sprawdzanie warunków podstawowych', queued: 'W kolejce AI', processing: 'Analiza w toku', completed: 'Analiza zakończona', rejected: 'Odrzucona przez Hard Filter', failed: 'Analiza nie powiodła się' } as const)[progress.state]
}

export function ImportAnalysisPage() {
  const { mode, session } = useAppMode(); const navigate = useNavigate()
  const sessionScope = mode === 'authenticated' && session ? `authenticated-${session.user.id}` : 'demo'
  const inputRef = useRef<HTMLInputElement>(null); const sequenceRef = useRef(0); const analysisRunRef = useRef(false); const freshBatchStartedRef = useRef(false); const initialSession = useRef(loadIntegratedAnalysisSession(undefined, sessionScope))
  const [batch, setBatch] = useState(() => initialSession.current?.batch ?? createImportBatchState()); const [isProcessingFiles, setIsProcessingFiles] = useState(false); const [isProcessingUrl, setIsProcessingUrl] = useState(false); const [urlInput, setUrlInput] = useState('')
  const [pipeline, setPipeline] = useState<PipelineState>(() => initialSession.current?.pipeline ?? 'idle'); const [pipelineError, setPipelineError] = useState(() => initialSession.current?.pipeline === 'partial_complete' ? 'Odświeżenie przerwało lokalne oczekiwanie na analizę. Możesz ponowić tylko nieukończoną ofertę.' : '')
  const [progress, setProgress] = useState<Record<string, IntegratedOfferProgress>>(() => initialSession.current?.progress ?? {}); const [counts, setCounts] = useState<IntegratedBatchCounts>(() => initialSession.current?.counts ?? emptyCounts); const [restoredWorkspaceBatch, setRestoredWorkspaceBatch] = useState(false)
  const [restoringWorkspace, setRestoringWorkspace] = useState(false)
  const summary = useMemo(() => summarizeBatch(batch), [batch]); const isReviewing = batch.entries.length > 0 && !isProcessingFiles && !isProcessingUrl

  useEffect(() => { saveIntegratedAnalysisSession({ batch, pipeline, progress, counts }, undefined, sessionScope) }, [batch, pipeline, progress, counts, sessionScope])
  useEffect(() => {
    if (!session || !shouldRestoreWorkspaceImport({ alreadyRestored: restoredWorkspaceBatch, isAuthenticated: mode === 'authenticated', hasBatchEntries: batch.entries.length > 0, pipeline, freshBatchStarted: freshBatchStartedRef.current, hasExplicitEmptyBatch: initialSession.current?.pipeline === 'idle' && initialSession.current.batch.entries.length === 0 })) return
    let cancelled = false
    setRestoringWorkspace(true)
    void workspaceRepositoryFor('authenticated', session.user).loadWorkspace().then((snapshot) => {
      if (cancelled || freshBatchStartedRef.current) return
      const restored = restoreActiveWorkspaceImport(snapshot)
      if (!restored) return
      setBatch(restored.batch); setPipeline(restored.pipeline); setProgress(restored.progress); setCounts(restored.counts)
    }).catch(() => { if (!cancelled) setPipelineError('Nie udało się odtworzyć zapisanego wyniku analizy.') }).finally(() => { if (!cancelled) setRestoredWorkspaceBatch(true); setRestoringWorkspace(false) })
    return () => { cancelled = true }
  }, [batch.entries.length, mode, pipeline, restoredWorkspaceBatch, session])

  function openFilePicker() { inputRef.current?.click() }
  async function handleSampleReport() {
    if (!mode || isProcessingFiles || isProcessingUrl || pipeline === 'running') return
    const startsFreshPacket = shouldResetTerminalBatchForNewFiles(pipeline)
    const report = createDemoSampleReport()
    freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); setPipelineError('')
    if (startsFreshPacket) { setPipeline('idle'); setProgress({}); setCounts(emptyCounts) }
    const id = createImportBatchId(report.fileName, sequenceRef.current++)
    setBatch((current) => appendBatchEntries(startsFreshPacket ? createImportBatchState() : current, [{ kind: 'report', id, report, removedOfferIds: [] }]))
  }
  async function handleFiles(files: FileList | null) {
    const selectedFiles = files ? Array.from(files) : []; if (!selectedFiles.length || isProcessingFiles || pipeline === 'running') return
    const startsFreshPacket = shouldResetTerminalBatchForNewFiles(pipeline)
    freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true)
    if (startsFreshPacket) { setPipeline('idle'); setProgress({}); setCounts(emptyCounts) }
    setIsProcessingFiles(true); setPipelineError(''); setBatch((current) => startsFreshPacket ? { ...createImportBatchState(), status: 'adding_files' } : { ...current, status: 'adding_files' }); await Promise.resolve()
    const entries: ImportBatchEntry[] = []
    for (const file of selectedFiles) {
      const id = createImportBatchId(file.name, sequenceRef.current++); const validation = validateEmlFile(file)
      if (!validation.valid) { entries.push({ kind: 'file_error', id, fileName: file.name, message: validation.error }); continue }
      setBatch((current) => ({ ...current, status: 'reading' })); const extraction = await extractEmlContent(file)
      if (!extraction.success) { entries.push({ kind: 'file_error', id, fileName: file.name, message: extraction.error ?? 'Nie udało się odczytać raportu.' }); continue }
      setBatch((current) => ({ ...current, status: 'parsing' })); const parsed = parseRocketJobsReport(extraction.text)
      if (!parsed.offers.length) { entries.push({ kind: 'file_error', id, fileName: file.name, message: parsed.warnings[0]?.message ?? 'Nie znaleźliśmy kompletnych ofert RocketJobs w tym raporcie.' }); continue }
      const report: ImportedReport = { version: 1, source: 'rocketjobs-eml', fileName: file.name, importedAt: new Date().toISOString(), offers: parsed.offers, warnings: [...parsed.warnings, ...parserWarnings(extraction.warnings)] }
      entries.push({ kind: 'report', id, report, removedOfferIds: [] })
    }
    setBatch((current) => appendBatchEntries(current, entries)); setIsProcessingFiles(false); if (inputRef.current) inputRef.current.value = ''
  }

  async function handleUrl() {
    if (!mode || isProcessingFiles || isProcessingUrl || pipeline === 'running') return
    const normalizedUrl = normalizeOfferUrl(urlInput)
    if (!normalizedUrl) { setPipelineError('Wklej poprawny adres HTTPS do oferty.'); return }
    const startsFreshPacket = shouldResetTerminalBatchForNewFiles(pipeline); freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); setIsProcessingUrl(true); setPipelineError(''); if (startsFreshPacket) { setPipeline('idle'); setProgress({}); setCounts(emptyCounts) }; setBatch((current) => startsFreshPacket ? { ...createImportBatchState(), status: 'reading' } : { ...current, status: 'reading' })
    try {
      const seed = createUrlOfferSeed(normalizedUrl)
      const source = await new OfferContentFetcher().fetch(seed)
      if (source.status === 'unavailable' || !source.title) throw new Error(source.errorCode ?? 'Nie udało się odczytać treści oferty z tego adresu.')
      const report = importedReportFromUrlSource(source, normalizedUrl)
      const key = createImportBatchId('url-' + normalizedUrl, sequenceRef.current++)
      setBatch((current) => appendBatchEntries(current, [{ kind: 'report', id: key, report, removedOfferIds: [] }]))
      setUrlInput('')
    } catch (cause) {
      const code = cause instanceof OfferSourceError ? cause.code : cause instanceof Error ? cause.message : 'SOURCE_FETCH_FAILED'
      setPipelineError(code === 'UNSUPPORTED_SOURCE_DOMAIN' ? 'Ten adres nie jest jeszcze obsługiwany. Użyj linku HTTPS z RocketJobs.' : 'Nie udało się odczytać treści oferty z tego adresu.')
      setBatch((current) => ({ ...current, status: 'idle' }))
    } finally { setIsProcessingUrl(false) }
  }
  function removeReport(reportId: string) { freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); setPipeline('idle'); setProgress({}); setCounts(emptyCounts); setPipelineError(''); setBatch((current) => removeBatchReport(current, reportId)); clearIntegratedAnalysisSession(undefined, sessionScope); }
  function startOver() { freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); sequenceRef.current = 0; setBatch(createImportBatchState()); setPipeline('idle'); setProgress({}); setCounts(emptyCounts); setPipelineError(''); clearIntegratedAnalysisSession(undefined, sessionScope); if (mode) void workspaceRepositoryFor(mode, session?.user).setActiveImportSession(null).catch((cause) => setPipelineError(cause instanceof Error ? cause.message : 'ACTIVE_IMPORT_SESSION_CLEAR_FAILED')); if (inputRef.current) inputRef.current.value = '' }
  async function startAnalysis(reportsOverride?: BatchReport[]) {
    if (!mode || pipeline === 'running' || analysisRunRef.current) return
    const reports = reportsOverride ?? batch.entries.filter((entry): entry is Extract<ImportBatchEntry, { kind: 'report' }> => entry.kind === 'report').map((entry) => ({ key: entry.id, report: entry.report, offers: visibleOffers(entry) })).filter((entry) => entry.offers.length > 0)
    if (!reports.length) { setPipelineError('Przywróć co najmniej jedną ofertę, aby rozpocząć analizę.'); return }
    analysisRunRef.current = true
    const cloudProfile = mode === 'authenticated' && session ? await supabaseProfileRepository(session.user).load() : null
    const localProfile = cloudProfile ? null : loadUserProfile()
    const profile = cloudProfile?.data ?? localProfile?.profile ?? null
    const profileError = cloudProfile?.error ?? localProfile?.warning
    if (!profile) { analysisRunRef.current = false; setPipelineError(profileError ?? 'Najpierw utwórz i zapisz profil, aby przeprowadzić analizę.'); return }
    const userId = mode === 'authenticated' && session ? session.user.id : 'demo-user'; const repository = workspaceRepositoryFor(mode, session?.user)
    setPipeline('running'); setPipelineError(''); setProgress(Object.fromEntries(reports.flatMap((report) => report.offers.map((offer) => [progressKey(report.key, offer.id), { key: progressKey(report.key, offer.id), offer, state: 'waiting' as const }])))); setCounts({ ...emptyCounts, total: reports.reduce((total, report) => total + report.offers.length, 0) })
    try {
      const result = await runIntegratedAnalysisBatch({ repository, mode, userId, profile, reports, onCounts: setCounts, onOfferProgress: (entry) => setProgress((current) => ({ ...current, [entry.key]: entry })) })
      setPipeline(result.partial ? 'partial_complete' : 'complete')
    } catch (cause) { setPipeline('idle'); setPipelineError(cause instanceof Error ? cause.message : 'Nie udało się rozpocząć analizy paczki.') } finally { analysisRunRef.current = false }
  }
  async function retryOffer(item: IntegratedOfferProgress, force = false) {
    if (!mode || !item.workspaceOfferId || pipeline === 'running') return
    if (force && !window.confirm('Analiza mimo odrzucenia uruchomi osobne, potencjalnie płatne wywołanie AI. Czy chcesz kontynuować?')) return
    const cloudProfile = mode === 'authenticated' && session ? await supabaseProfileRepository(session.user).load() : null
    const localProfile = cloudProfile ? null : loadUserProfile(); const profile = cloudProfile?.data ?? localProfile?.profile ?? null
    if (!profile) { setPipelineError(cloudProfile?.error ?? localProfile?.warning ?? 'Najpierw zapisz profil.'); return }
    setPipeline('running'); setPipelineError('')
    try {
      setCounts((current) => ({ ...current, failed: Math.max(0, current.failed - 1), queued: current.queued + 1 }))
      await retryIntegratedOffer({ repository: workspaceRepositoryFor(mode, session?.user), mode, profile, offerId: item.workspaceOfferId, offer: item.offer, hardFilterStatus: item.hardFilterStatus ?? 'pass', allowHardFilterFail: force, onProgress: (next) => {
        setProgress((current) => Object.fromEntries(Object.entries(current).map(([entryKey, entry]) => entry.workspaceOfferId === item.workspaceOfferId || entryKey === item.key ? [entryKey, { ...next, key: entryKey }] : [entryKey, entry])))
        if (next.state === 'processing') setCounts((current) => ({ ...current, queued: Math.max(0, current.queued - 1), processing: current.processing + 1 }))
        if (next.state === 'completed') setCounts((current) => ({ ...current, processing: Math.max(0, current.processing - 1), completed: current.completed + 1 }))
      } })
      setPipeline((current) => Object.values(progress).some((entry) => entry.key !== item.key && entry.state === 'failed') ? 'partial_complete' : 'complete')
    } catch (cause) {
      setCounts((current) => ({ ...current, queued: Math.max(0, current.queued - 1), processing: Math.max(0, current.processing - 1), failed: current.failed + 1 }))
      setProgress((current) => ({ ...current, [item.key]: { ...item, state: 'failed', error: cause instanceof Error ? cause.message : 'ANALYSIS_REQUEST_FAILED' } })); setPipeline('partial_complete')
    }
  }
  const canStart = pipeline === 'idle' && summary.visibleOfferCount > 0 && !isProcessingFiles
  const isFinished = pipeline === 'complete' || pipeline === 'partial_complete'

  if (restoringWorkspace) return <section className="page page--loading-surface" aria-busy="true"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only" role="status">Ładowanie raportu</span></section>

  return <section className="page page--wide">
    <PageHeader eyebrow="Raporty ofert" title="Import i analiza" intro="Dodaj raporty, sprawdź rozpoznane dane i uruchom jedną analizę całej paczki." />
    <input ref={inputRef} className="sr-only" type="file" multiple accept=".eml,message/rfc822" onChange={(event) => void handleFiles(event.target.files)} />
    {(['adding_files', 'reading', 'parsing'] as const).includes(batch.status as keyof typeof processingLabels) && <SectionCard title="Przygotowujemy paczkę"><p className="field-hint">{processingLabels[batch.status as keyof typeof processingLabels]}</p></SectionCard>}
    {!isReviewing && !isProcessingFiles && !isProcessingUrl && <SectionCard className="dropzone-card"><div className="file-dropzone"><span className="dropzone-icon" aria-hidden="true">⇧</span><h2>Dodaj raporty w formacie .eml</h2><p>Możesz wybrać kilka raportów naraz lub dodawać je później. Nie przechowujemy treści EML, nagłówków wiadomości ani CV w chmurze.</p><div className="action-row"><PrimaryButton onClick={openFilePicker}>Wybierz raporty</PrimaryButton>{mode === 'demo' && <SecondaryButton onClick={() => void handleSampleReport()}>Wgraj przykładowy .eml</SecondaryButton>}</div><span className="field-hint">Format .eml · maksymalnie 10 MB na plik</span><div className="url-import"><label htmlFor="offer-url">Albo wklej link do oferty</label><div className="url-import__row"><input id="offer-url" type="url" inputMode="url" placeholder="https://rocketjobs.pl/..." value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleUrl() }} /><PrimaryButton onClick={() => void handleUrl()} disabled={!urlInput.trim() || isProcessingUrl}>Analizuj z linku</PrimaryButton></div><span className="field-hint">Obsługiwane są bezpieczne linki HTTPS z RocketJobs.</span></div></div></SectionCard>}
{isProcessingUrl && <SectionCard title="Przygotowujemy ofertę z linku"><p className="field-hint">Pobieramy i normalizujemy treść oferty, a następnie uruchomimy analizę.</p></SectionCard>}
    {isReviewing && <>
      <SectionCard title="Przygotowanie paczki do analizy" className="import-review-card">
        <p className="section-intro">Wybierz interesujące Cię raporty. Sprawdź rozpoznane oferty, warningi i braki danych. Kliknij „Przeprowadź analizę”.</p>
        {batch.status === 'partial_review' && <Alert title="Część plików wymaga uwagi" tone="warning">Poprawne raporty pozostały w paczce. Błędny plik nie usuwa rozpoznanych ofert.</Alert>}
        {batch.status === 'file_error' && <Alert title="Plik wymaga poprawy" tone="warning">Nie udało się rozpoznać żadnego poprawnego raportu. Możesz dodać kolejny plik albo zacząć od nowa.</Alert>}
        {pipelineError && <Alert title="Nie można ukończyć analizy" tone="warning">{pipelineError}</Alert>}
        <div className="batch-summary" aria-label="Podsumowanie paczki"><span><strong>{summary.reportCount}</strong> raporty</span><span><strong>{summary.visibleOfferCount}</strong> widoczne oferty</span><span><strong>{summary.warningCount}</strong> warningi</span><span><strong>{summary.missingFieldCount}</strong> braki pól</span></div>
        {summary.localDuplicateCount > 0 && <Alert title="Możliwe powtórzenia w bieżącej paczce" tone="info">Rozpoznaliśmy lokalne powtórzenia według linku źródłowego lub pary firma/stanowisko. Nie łączymy ich na tym ekranie.</Alert>}
        <ul className="import-report-list" aria-label="Wybrane raporty">
          {batch.entries.map((entry) => entry.kind === 'file_error' ? <li key={entry.id} className="import-report-list__error"><div><strong>{entry.fileName}</strong><span>Nie udało się przygotować pliku</span></div><Alert title="Plik pominięty" tone="warning">{entry.message}</Alert></li> : <li key={entry.id}>
            <div className="import-report-list__heading"><div><strong>{entry.report.fileName}</strong><span>Rozpoznano {entry.report.offers.length} ofert · widoczne {visibleOffers(entry).length}</span></div><SecondaryButton onClick={() => removeReport(entry.id)} disabled={pipeline === 'running'}>Usuń raport</SecondaryButton></div>
            {entry.report.warnings.length > 0 && <ul className="import-warnings">{entry.report.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul>}
            <ul className="recognized-offers">{visibleOffers(entry).map((offer) => { const item = progress[progressKey(entry.id, offer.id)]; const issues = presentOfferIssues(offer); return <li className={`analysis-tile analysis-tile--${item?.state ?? 'waiting'}`} key={offer.id}><div><strong>{offer.title}</strong><span>{offer.company}{offer.sourceLabel ? ` · ${offer.sourceLabel}` : ''}{offer.location ? ` · ${offer.location}` : ''}</span>{issues.missing.length > 0 && <small className="offer-missing">Brakuje: {issues.missing.join(', ')}.</small>}{issues.warnings.length > 0 && <small className="offer-warning">Do sprawdzenia: {issues.warnings.join(', ')}.</small>}<span className="analysis-tile__state">{statusLabel(item)}</span>{item?.state === 'processing' && <small>Sprawdzamy dopasowanie doświadczenia, umiejętności, preferencji i kierunku rozwoju.</small>}{item?.state === 'failed' && <><small className="analysis-tile__error">{item.error ?? 'Wystąpił błąd analizy.'}</small><SecondaryButton onClick={() => void retryOffer(item)}>Spróbuj ponownie</SecondaryButton></>}{item?.state === 'completed' && <AnalysisPreview analysis={item.analysis} hardFilter={item.hardFilterStatus} freshness={item.freshness} analysisVersionId={item.analysisVersionId} />}{item?.state === 'rejected' && <><AnalysisPreview hardFilter="fail" /><SecondaryButton onClick={() => void retryOffer(item, true)}>Analizuj mimo odrzucenia</SecondaryButton></>}</div>{pipeline !== 'running' && !isFinished && <SecondaryButton onClick={() => setBatch((current) => removeBatchOffer(current, entry.id, offer.id))}>Usuń ofertę</SecondaryButton>}</li> })}</ul>
          </li>)}
        </ul>
        <div className="action-row action-row--spaced"><SecondaryButton onClick={openFilePicker} disabled={pipeline === 'running'}>Dodaj kolejny raport</SecondaryButton><SecondaryButton onClick={() => setBatch((current) => restoreBatchOffers(current))} disabled={!hasRemovedOffers(batch) || pipeline === 'running'}>Przywróć listę</SecondaryButton><SecondaryButton onClick={startOver} disabled={pipeline === 'running'}>Zacznij od nowa</SecondaryButton></div>
      </SectionCard>
      <SectionCard title="Analiza i wyniki" className="analysis-control-card">
        {pipeline === 'idle' && <p className="section-intro">Po uruchomieniu analizy zobaczysz postęp dla każdej oferty. Po zakończeniu możesz przejść do pełnej listy wyników.</p>}
        {pipeline === 'running' && <><Alert title="Analiza w toku" tone="info">Przetwarzamy paczkę kolejno, aktualny status analizy jest widoczny przy poszczególnych ofertach.</Alert><div className="analysis-counts"><span>wszystkie: {counts.total}</span><span>odrzucone przez HF: {counts.hardFilterRejected}</span><span>w kolejce: {counts.queued}</span><span>analizowane: {counts.processing}</span><span>zakończone: {counts.completed}</span><span>błędy: {counts.failed}</span></div></>}
        {pipeline === 'partial_complete' && <Alert title="Analiza ukończona częściowo" tone="warning">Część ofert wymaga ponowienia. Pozostałe wyniki są gotowe.</Alert>}
        {pipeline === 'complete' && <Alert title="Analiza zakończona" tone="success">Wyniki zostały zapisane w workspace i możesz przejść do pełnej listy.</Alert>}
        <PrimaryButton className={isFinished ? 'button--success' : pipeline === 'running' ? 'button--processing' : ''} disabled={!canStart && !isFinished} onClick={() => isFinished ? navigate('/offers') : void startAnalysis()}>{isFinished ? 'Zobacz wyniki analizy' : pipeline === 'running' ? 'Analiza w toku' : 'Przeprowadź analizę'}</PrimaryButton>
      </SectionCard>
    </>}
  </section>
}

function AnalysisPreview({ analysis, hardFilter, freshness, analysisVersionId }: { analysis?: JobAnalysis; hardFilter?: 'pass' | 'weak' | 'fail'; freshness?: IntegratedOfferProgress['freshness']; analysisVersionId?: string | null }) {
  if (hardFilter === 'fail') return <div className="analysis-preview"><strong>Odrzucona przez Hard Filter</strong><span>AI pominięte — nie zużyto tokenów.</span></div>
  if (!analysis) return null
  return <div className="analysis-preview"><HardFilterStatusBadge status={hardFilter ?? analysis.hardFilterStatus} /><strong>{analysis.overallScore}/100 - {scoreBand(analysis.overallScore)}</strong><span>Rekomendacja: {analysis.recommendation}</span><span>{analysis.summary}</span><AnalysisQuality analysis={analysis} />{freshness && <small>Freshness: {freshness}</small>}{analysisVersionId && <small>analysis_version_id: {analysisVersionId}</small>}{analysis.risks[0] && <small>Ryzyko: {analysis.risks[0]}</small>}{analysis.scoring?.reliability === 'limited' && <small>Wynik oparty na ograniczonej liczbie danych.</small>}</div>
}

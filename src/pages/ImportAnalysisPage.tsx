import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ImportedReport, ImportWarning } from '../contracts/import'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import { Alert, AnalysisQuality, HardFilterStatusBadge, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { useAppMode } from '../features/access/AppModeProvider'
import { type BatchReport, type IntegratedBatchCounts, type IntegratedOfferProgress, retryIntegratedOffer, runIntegratedAnalysisBatch } from '../features/analysis/integratedAnalysisFlow'
import { clearIntegratedAnalysisSession, loadIntegratedAnalysisSession, saveIntegratedAnalysisSession } from '../features/analysis/integratedAnalysisSession'
import { restoreActiveWorkspaceImport, shouldResetTerminalBatchForNewFiles, shouldRestoreWorkspaceImport } from '../features/analysis/restoredWorkspaceImport'
import { extractEmlContent } from '../features/import/emlExtractor'
import { appendBatchEntries, createImportBatchId, createImportBatchState, hasRemovedOffers, removeBatchOffer, removeBatchReport, restoreBatchOffers, summarizeBatch, visibleOffers, type ImportBatchEntry } from '../features/import/importBatchState'
import { validateEmlFile } from '../features/import/importUtils'
import { parseRocketJobsReport } from '../features/import/rocketJobsReportParser'
import { importWarningLabel, presentOfferIssues } from '../features/import/offerIssuePresentation'
import { createUrlOfferSeed, importedReportFromUrlSource, normalizeOfferUrl } from '../features/import/urlOfferImport'
import { OfferContentFetcher, OfferSourceError } from '../features/offers/offerContentFetcher'
import { loadUserProfile } from '../features/profile/profileStorage'
import { supabaseProfileRepository } from '../features/supabase/repositories'
import { workspaceRepositoryFor } from '../features/workspace/workspaceService'
import { analysisErrorLabel, analysisFreshnessLabel } from '../features/workspace/presentationLabels'
import { createDemoSampleReport } from '../demo/demoSampleData'
import { useI18n } from '../i18n/I18nProvider'

const emptyCounts: IntegratedBatchCounts = { total: 0, hardFilterRejected: 0, queued: 0, processing: 0, completed: 0, failed: 0 }
type PipelineState = 'idle' | 'running' | 'complete' | 'partial_complete'
type PipelineErrorKey =
  | 'import.error.refreshInterrupted'
  | 'import.error.partialRestore'
  | 'import.error.restore'
  | 'import.error.invalidUrl'
  | 'import.error.unsupportedUrl'
  | 'import.error.urlRead'
  | 'import.error.restoreOffer'
  | 'import.error.profileRequired'
  | 'import.error.profileSaveRequired'
  | 'import.error.start'
type PipelineError = { key: PipelineErrorKey } | { message: string } | null

function parserWarnings(warnings: string[]): ImportWarning[] { return warnings.map((message) => ({ code: 'partial-parse' as const, message })) }
function progressKey(reportId: string, offerId: string) { return `${reportId}:${offerId}` }
function translatedPipelineError(key: PipelineErrorKey): PipelineError { return { key } }
function rawPipelineError(message: string): PipelineError { return { message } }
export function ImportAnalysisPage() {
  const { t, locale } = useI18n()
  const { mode, session } = useAppMode(); const navigate = useNavigate()
  const processingLabels = { adding_files: t('import.processing.adding'), reading: t('import.processing.reading'), parsing: t('import.processing.parsing') } as const
  const statusLabel = (progress?: IntegratedOfferProgress) => {
    if (!progress) return t('import.status.waiting')
    return ({ waiting: t('import.status.waiting'), hard_filtering: t('import.status.hardFiltering'), queued: t('import.status.queued'), processing: t('import.status.processing'), completed: t('import.status.completed'), rejected: t('import.status.rejected'), failed: t('import.status.failed') } as const)[progress.state]
  }
  const sessionScope = mode === 'authenticated' && session ? `authenticated-${session.user.id}` : 'demo'
  const inputRef = useRef<HTMLInputElement>(null); const sequenceRef = useRef(0); const analysisRunRef = useRef(false); const freshBatchStartedRef = useRef(false); const loadedSession = loadIntegratedAnalysisSession(undefined, sessionScope); const initialSession = useRef(loadedSession?.pipeline === 'complete' ? null : loadedSession)
  const [batch, setBatch] = useState(() => initialSession.current?.batch ?? createImportBatchState()); const [isProcessingFiles, setIsProcessingFiles] = useState(false); const [isProcessingUrl, setIsProcessingUrl] = useState(false); const [urlInput, setUrlInput] = useState('')
  const [pipeline, setPipeline] = useState<PipelineState>(() => initialSession.current?.pipeline ?? 'idle'); const [pipelineError, setPipelineError] = useState<PipelineError>(() => initialSession.current?.pipeline === 'partial_complete' ? translatedPipelineError('import.error.refreshInterrupted') : null)
  const [progress, setProgress] = useState<Record<string, IntegratedOfferProgress>>(() => initialSession.current?.progress ?? {}); const [counts, setCounts] = useState<IntegratedBatchCounts>(() => initialSession.current?.counts ?? emptyCounts); const [restoredWorkspaceBatch, setRestoredWorkspaceBatch] = useState(false)
  const [restoringWorkspace, setRestoringWorkspace] = useState(false)
  const summary = useMemo(() => summarizeBatch(batch), [batch]); const isReviewing = batch.entries.length > 0 && !isProcessingFiles && !isProcessingUrl
  const pipelineErrorMessage = pipelineError ? ('key' in pipelineError ? t(pipelineError.key) : pipelineError.message) : ''

  useEffect(() => { saveIntegratedAnalysisSession({ batch, pipeline, progress, counts }, undefined, sessionScope) }, [batch, pipeline, progress, counts, sessionScope])
  useEffect(() => {
    if (!session || !shouldRestoreWorkspaceImport({ alreadyRestored: restoredWorkspaceBatch, isAuthenticated: mode === 'authenticated', hasBatchEntries: batch.entries.length > 0, pipeline, freshBatchStarted: freshBatchStartedRef.current, hasExplicitEmptyBatch: !initialSession.current || (initialSession.current.pipeline === 'idle' && initialSession.current.batch.entries.length === 0) })) return
    let cancelled = false
    setRestoringWorkspace(true)
    void workspaceRepositoryFor('authenticated', session.user).loadWorkspace().then((snapshot) => {
      if (cancelled || freshBatchStartedRef.current) return
      const restored = restoreActiveWorkspaceImport(snapshot)
      if (!restored) return
      setBatch(restored.batch); setPipeline(restored.pipeline); setProgress(restored.progress); setCounts(restored.counts); setPipelineError(restored.pipeline === 'partial_complete' ? translatedPipelineError('import.error.partialRestore') : null)
    }).catch(() => { if (!cancelled) setPipelineError(translatedPipelineError('import.error.restore')) }).finally(() => { if (!cancelled) setRestoredWorkspaceBatch(true); setRestoringWorkspace(false) })
    return () => { cancelled = true }
  }, [batch.entries.length, mode, pipeline, restoredWorkspaceBatch, session])

  function openFilePicker() { inputRef.current?.click() }
  async function handleSampleReport() {
    if (!mode || isProcessingFiles || isProcessingUrl || pipeline === 'running') return
    const startsFreshPacket = shouldResetTerminalBatchForNewFiles(pipeline)
    const report = createDemoSampleReport()
    freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); setPipelineError(null)
    if (startsFreshPacket) { setPipeline('idle'); setProgress({}); setCounts(emptyCounts) }
    const id = createImportBatchId(report.fileName, sequenceRef.current++)
    setBatch((current) => appendBatchEntries(startsFreshPacket ? createImportBatchState() : current, [{ kind: 'report', id, report, removedOfferIds: [] }]))
  }
  async function handleFiles(files: FileList | null) {
    const selectedFiles = files ? Array.from(files) : []; if (!selectedFiles.length || isProcessingFiles || pipeline === 'running') return
    const startsFreshPacket = shouldResetTerminalBatchForNewFiles(pipeline)
    freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true)
    if (startsFreshPacket) { setPipeline('idle'); setProgress({}); setCounts(emptyCounts) }
    setIsProcessingFiles(true); setPipelineError(null); setBatch((current) => startsFreshPacket ? { ...createImportBatchState(), status: 'adding_files' } : { ...current, status: 'adding_files' }); await Promise.resolve()
    const entries: ImportBatchEntry[] = []
    for (const file of selectedFiles) {
      const id = createImportBatchId(file.name, sequenceRef.current++); const validation = validateEmlFile(file)
      if (!validation.valid) { entries.push({ kind: 'file_error', id, fileName: file.name, message: validation.error }); continue }
      setBatch((current) => ({ ...current, status: 'reading' })); const extraction = await extractEmlContent(file)
      if (!extraction.success) { entries.push({ kind: 'file_error', id, fileName: file.name, message: extraction.error ?? t('import.error.readReport') }); continue }
      setBatch((current) => ({ ...current, status: 'parsing' })); const parsed = parseRocketJobsReport(extraction.text)
      if (!parsed.offers.length) { entries.push({ kind: 'file_error', id, fileName: file.name, message: parsed.warnings[0]?.message ?? t('import.error.noOffers') }); continue }
      const report: ImportedReport = { version: 1, source: 'rocketjobs-eml', fileName: file.name, importedAt: new Date().toISOString(), offers: parsed.offers, warnings: [...parsed.warnings, ...parserWarnings(extraction.warnings)] }
      entries.push({ kind: 'report', id, report, removedOfferIds: [] })
    }
    setBatch((current) => appendBatchEntries(current, entries)); setIsProcessingFiles(false); if (inputRef.current) inputRef.current.value = ''
  }

  async function handleUrl() {
    if (!mode || isProcessingFiles || isProcessingUrl || pipeline === 'running') return
    const normalizedUrl = normalizeOfferUrl(urlInput)
    if (!normalizedUrl) { setPipelineError(translatedPipelineError('import.error.invalidUrl')); return }
    const startsFreshPacket = shouldResetTerminalBatchForNewFiles(pipeline); freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); setIsProcessingUrl(true); setPipelineError(null); if (startsFreshPacket) { setPipeline('idle'); setProgress({}); setCounts(emptyCounts) }; setBatch((current) => startsFreshPacket ? { ...createImportBatchState(), status: 'reading' } : { ...current, status: 'reading' })
    try {
      const seed = createUrlOfferSeed(normalizedUrl)
      const source = await new OfferContentFetcher().fetch(seed)
      if (source.status === 'unavailable' || !source.title) throw new Error(source.errorCode ?? t('import.error.urlRead'))
      const report = importedReportFromUrlSource(source, normalizedUrl)
      const key = createImportBatchId('url-' + normalizedUrl, sequenceRef.current++)
      setBatch((current) => appendBatchEntries(current, [{ kind: 'report', id: key, report, removedOfferIds: [] }]))
      setUrlInput('')
    } catch (cause) {
      const code = cause instanceof OfferSourceError ? cause.code : cause instanceof Error ? cause.message : 'SOURCE_FETCH_FAILED'
      setPipelineError(translatedPipelineError(code === 'UNSUPPORTED_SOURCE_DOMAIN' ? 'import.error.unsupportedUrl' : 'import.error.urlRead'))
      setBatch((current) => ({ ...current, status: 'idle' }))
    } finally { setIsProcessingUrl(false) }
  }
  function removeReport(reportId: string) { freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); setPipeline('idle'); setProgress({}); setCounts(emptyCounts); setPipelineError(null); setBatch((current) => removeBatchReport(current, reportId)); clearIntegratedAnalysisSession(undefined, sessionScope); }
  function startOver() { freshBatchStartedRef.current = true; setRestoredWorkspaceBatch(true); sequenceRef.current = 0; setBatch(createImportBatchState()); setPipeline('idle'); setProgress({}); setCounts(emptyCounts); setPipelineError(null); clearIntegratedAnalysisSession(undefined, sessionScope); if (mode) void workspaceRepositoryFor(mode, session?.user).setActiveImportSession(null).catch((cause) => setPipelineError(rawPipelineError(cause instanceof Error ? cause.message : 'ACTIVE_IMPORT_SESSION_CLEAR_FAILED'))); if (inputRef.current) inputRef.current.value = '' }
  async function startAnalysis(reportsOverride?: BatchReport[]) {
    if (!mode || pipeline === 'running' || analysisRunRef.current) return
    const reports = reportsOverride ?? batch.entries.filter((entry): entry is Extract<ImportBatchEntry, { kind: 'report' }> => entry.kind === 'report').map((entry) => ({ key: entry.id, report: entry.report, offers: visibleOffers(entry) })).filter((entry) => entry.offers.length > 0)
    if (!reports.length) { setPipelineError(translatedPipelineError('import.error.restoreOffer')); return }
    analysisRunRef.current = true
    const cloudProfile = mode === 'authenticated' && session ? await supabaseProfileRepository(session.user).load() : null
    const localProfile = cloudProfile ? null : loadUserProfile()
    const profile = cloudProfile?.data ?? localProfile?.profile ?? null
    const profileError = cloudProfile?.error ?? localProfile?.warning
    if (!profile) { analysisRunRef.current = false; setPipelineError(profileError ? rawPipelineError(profileError) : translatedPipelineError('import.error.profileRequired')); return }
    const userId = mode === 'authenticated' && session ? session.user.id : 'demo-user'; const repository = workspaceRepositoryFor(mode, session?.user)
    setPipeline('running'); setPipelineError(null); setProgress(Object.fromEntries(reports.flatMap((report) => report.offers.map((offer) => [progressKey(report.key, offer.id), { key: progressKey(report.key, offer.id), offer, state: 'waiting' as const }])))); setCounts({ ...emptyCounts, total: reports.reduce((total, report) => total + report.offers.length, 0) })
    try {
      const result = await runIntegratedAnalysisBatch({ repository, mode, userId, profile, reports, onCounts: setCounts, onOfferProgress: (entry) => setProgress((current) => ({ ...current, [entry.key]: entry })) })
      setPipeline(result.partial ? 'partial_complete' : 'complete')
    } catch (cause) { setPipeline('idle'); setPipelineError(cause instanceof Error ? rawPipelineError(cause.message) : translatedPipelineError('import.error.start')) } finally { analysisRunRef.current = false }
  }
  async function retryOffer(item: IntegratedOfferProgress, force = false) {
    if (!mode || !item.workspaceOfferId || pipeline === 'running') return
    if (force && !window.confirm(t('import.confirm.force'))) return
    const cloudProfile = mode === 'authenticated' && session ? await supabaseProfileRepository(session.user).load() : null
    const localProfile = cloudProfile ? null : loadUserProfile(); const profile = cloudProfile?.data ?? localProfile?.profile ?? null
    if (!profile) { const profileError = cloudProfile?.error ?? localProfile?.warning; setPipelineError(profileError ? rawPipelineError(profileError) : translatedPipelineError('import.error.profileSaveRequired')); return }
    setPipeline('running'); setPipelineError(null)
    try {
      setCounts((current) => ({ ...current, failed: Math.max(0, current.failed - 1), queued: current.queued + 1 }))
      const repository = workspaceRepositoryFor(mode, session?.user)
      const details = await repository.loadOfferDetails(item.workspaceOfferId)
      if (details.analysisState.queueItem?.status === 'queued' && details.analysisState.queueItem.lastError) await repository.cancelQueuedAnalysis(details.analysisState.queueItem.id)
      await retryIntegratedOffer({ repository, mode, profile, offerId: item.workspaceOfferId, offer: item.offer, hardFilterStatus: item.hardFilterStatus ?? 'pass', allowHardFilterFail: force, onProgress: (next) => {
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

  if (restoringWorkspace) return <section className="page page--loading-surface" aria-busy="true"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only" role="status">{t('import.loading')}</span></section>

  return <section className="page page--wide">
    <PageHeader eyebrow={t('import.header.eyebrow')} title={t('import.header.title')} intro={t('import.header.intro')} />
    <input ref={inputRef} className="sr-only" type="file" multiple accept=".eml,message/rfc822" onChange={(event) => void handleFiles(event.target.files)} />
    {(['adding_files', 'reading', 'parsing'] as const).includes(batch.status as keyof typeof processingLabels) && <SectionCard title={t('import.processing.title')}><p className="field-hint">{processingLabels[batch.status as keyof typeof processingLabels]}</p></SectionCard>}
    {pipelineErrorMessage && !isReviewing && <Alert title={t('import.review.analysisErrorTitle')} tone="warning">{pipelineErrorMessage}</Alert>}
    {!isReviewing && !isProcessingFiles && !isProcessingUrl && <SectionCard className="dropzone-card"><div className="file-dropzone"><span className="dropzone-icon" aria-hidden="true">⇧</span><h2>{t('import.drop.title')}</h2><p>{t('import.drop.copy')}</p><div className="action-row"><PrimaryButton onClick={openFilePicker}>{t('import.drop.choose')}</PrimaryButton>{mode === 'demo' && <SecondaryButton onClick={() => void handleSampleReport()}>{t('import.drop.sample')}</SecondaryButton>}</div><span className="field-hint">{t('import.drop.format')}</span><div className="url-import"><label htmlFor="offer-url">{t('import.url.label')}</label><div className="url-import__row"><input id="offer-url" type="url" inputMode="url" placeholder="https://rocketjobs.pl/..." value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleUrl() }} /><PrimaryButton onClick={() => void handleUrl()} disabled={!urlInput.trim() || isProcessingUrl}>{t('import.url.action')}</PrimaryButton></div><span className="field-hint">{t('import.url.hint')}</span></div></div></SectionCard>}
{isProcessingUrl && <SectionCard title={t('import.url.processingTitle')}><p className="field-hint">{t('import.url.processingCopy')}</p></SectionCard>}
    {isReviewing && <>
      <SectionCard title={t('import.review.title')} className="import-review-card">
        <p className="section-intro">{t('import.review.intro')}</p>
        {batch.status === 'partial_review' && <Alert title={t('import.review.partialTitle')} tone="warning">{t('import.review.partialCopy')}</Alert>}
        {batch.status === 'file_error' && <Alert title={t('import.review.fileErrorTitle')} tone="warning">{t('import.review.fileErrorCopy')}</Alert>}
        {pipelineErrorMessage && <Alert title={t('import.review.analysisErrorTitle')} tone="warning">{pipelineErrorMessage}</Alert>}
        <div className="batch-summary" aria-label={t('import.summary.aria')}><span><strong>{summary.reportCount}</strong> {t('import.summary.reports')}</span><span><strong>{summary.visibleOfferCount}</strong> {t('import.summary.offers')}</span><span><strong>{summary.warningCount}</strong> {t('import.summary.warnings')}</span><span><strong>{summary.missingFieldCount}</strong> {t('import.summary.missing')}</span></div>
        {summary.localDuplicateCount > 0 && <Alert title={t('import.duplicates.title')} tone="info">{t('import.duplicates.copy')}</Alert>}
        <ul className="import-report-list" aria-label={t('import.reports.aria')}>
          {batch.entries.map((entry) => entry.kind === 'file_error' ? <li key={entry.id} className="import-report-list__error"><div><strong>{entry.fileName}</strong><span>{t('import.file.failed')}</span></div><Alert title={t('import.file.skipped')} tone="warning">{entry.message}</Alert></li> : <li key={entry.id}>
            <div className="import-report-list__heading"><div><strong>{entry.report.fileName}</strong><span>{t('import.report.recognized', { all: entry.report.offers.length, visible: visibleOffers(entry).length })}</span></div><SecondaryButton onClick={() => removeReport(entry.id)} disabled={pipeline === 'running'}>{t('import.action.removeReport')}</SecondaryButton></div>
            {entry.report.warnings.length > 0 && <ul className="import-warnings">{entry.report.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{importWarningLabel(warning, locale)}</li>)}</ul>}
            <ul className="recognized-offers">{visibleOffers(entry).map((offer) => { const item = progress[progressKey(entry.id, offer.id)]; const issues = presentOfferIssues(offer, locale); return <li className={`analysis-tile analysis-tile--${item?.state ?? 'waiting'}`} key={offer.id}><div><strong>{offer.title}</strong><span>{offer.company}{offer.sourceLabel ? ` · ${offer.sourceLabel}` : ''}{offer.location ? ` · ${offer.location}` : ''}</span>{issues.missing.length > 0 && <small className="offer-missing">{t('import.offer.missing')} {issues.missing.join(', ')}.</small>}{issues.warnings.length > 0 && <small className="offer-warning">{t('import.offer.review')} {issues.warnings.join(', ')}.</small>}<span className="analysis-tile__state">{statusLabel(item)}</span>{item?.state === 'processing' && <small>{t('import.offer.processing')}</small>}{item?.state === 'failed' && <><small className="analysis-tile__error">{analysisErrorLabel(item.error, locale)}</small><SecondaryButton onClick={() => void retryOffer(item)}>{t('import.action.retry')}</SecondaryButton></>}{item?.state === 'completed' && <AnalysisPreview analysis={item.analysis} hardFilter={item.hardFilterStatus} freshness={item.freshness} analysisVersionId={item.analysisVersionId} />}{item?.state === 'rejected' && <><AnalysisPreview hardFilter="fail" /><SecondaryButton onClick={() => void retryOffer(item, true)}>{t('import.action.force')}</SecondaryButton></>}</div>{pipeline !== 'running' && !isFinished && <SecondaryButton onClick={() => setBatch((current) => removeBatchOffer(current, entry.id, offer.id))}>{t('import.action.removeOffer')}</SecondaryButton>}</li> })}</ul>
          </li>)}
        </ul>
        <div className="action-row action-row--spaced"><SecondaryButton onClick={openFilePicker} disabled={pipeline === 'running'}>{t('import.action.addReport')}</SecondaryButton><SecondaryButton onClick={() => setBatch((current) => restoreBatchOffers(current))} disabled={!hasRemovedOffers(batch) || pipeline === 'running'}>{t('import.action.restore')}</SecondaryButton><SecondaryButton onClick={startOver} disabled={pipeline === 'running'}>{t('import.action.restart')}</SecondaryButton></div>
      </SectionCard>
      <SectionCard title={t('import.analysis.title')} className="analysis-control-card">
        {pipeline === 'idle' && <p className="section-intro">{t('import.analysis.idle')}</p>}
        {pipeline === 'running' && <><Alert title={t('import.analysis.runningTitle')} tone="info">{t('import.analysis.runningCopy')}</Alert><div className="analysis-counts"><span>{t('import.analysis.countTotal')} {counts.total}</span><span>{t('import.analysis.countRejected')} {counts.hardFilterRejected}</span><span>{t('import.analysis.countQueued')} {counts.queued}</span><span>{t('import.analysis.countProcessing')} {counts.processing}</span><span>{t('import.analysis.countCompleted')} {counts.completed}</span><span>{t('import.analysis.countFailed')} {counts.failed}</span></div></>}
        {pipeline === 'partial_complete' && <Alert title={t('import.analysis.partialTitle')} tone="warning">{t('import.analysis.partialCopy')}</Alert>}
        {pipeline === 'complete' && <Alert title={t('import.analysis.completeTitle')} tone="success">{t('import.analysis.completeCopy')}</Alert>}
        <PrimaryButton className={isFinished ? 'button--success' : pipeline === 'running' ? 'button--processing' : ''} disabled={!canStart && !isFinished} onClick={() => isFinished ? navigate('/offers') : void startAnalysis()}>{isFinished ? t('import.analysis.showResults') : pipeline === 'running' ? t('import.analysis.running') : t('import.analysis.start')}</PrimaryButton>
      </SectionCard>
    </>}
  </section>
}

function AnalysisPreview({ analysis, hardFilter, freshness, analysisVersionId }: { analysis?: JobAnalysis; hardFilter?: 'pass' | 'weak' | 'fail'; freshness?: IntegratedOfferProgress['freshness']; analysisVersionId?: string | null }) {
  const { t, locale } = useI18n()
  if (hardFilter === 'fail') return <div className="analysis-preview"><strong>{t('import.preview.rejected')}</strong><span>{t('import.preview.noAi')}</span></div>
  if (!analysis) return null
  return <div className="analysis-preview"><HardFilterStatusBadge status={hardFilter ?? analysis.hardFilterStatus} /><AnalysisQuality analysis={analysis} />{freshness && <small>{t('import.preview.freshness')} {analysisFreshnessLabel(freshness, locale)}</small>}{analysisVersionId && <small>analysis_version_id: {analysisVersionId}</small>}</div>
}

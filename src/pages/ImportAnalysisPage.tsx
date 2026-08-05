import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ImportedReport, ReportImportStatus } from '../contracts/import'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { useAppMode } from '../features/access/AppModeProvider'
import { evaluateOffers } from '../features/hardFilter/hardFilter'
import { extractEmlContent } from '../features/import/emlExtractor'
import { clearImportedReport, loadImportedReport, saveImportedReport } from '../features/import/importSessionStorage'
import { canStartDemoAnalysis, restoreImportedOffers } from '../features/import/importReviewState'
import { validateEmlFile } from '../features/import/importUtils'
import { parseRocketJobsReport } from '../features/import/rocketJobsReportParser'
import { loadUserProfile } from '../features/profile/profileStorage'
import { supabaseProfileRepository } from '../features/supabase/repositories'
import { toWorkspaceImportInput, type HardFilterBatchItem } from '../features/workspace/workspaceRepository'
import { workspaceRepositoryFor } from '../features/workspace/workspaceService'

const processingLabels: Record<Extract<ReportImportStatus, 'validating' | 'reading' | 'parsing'>, string> = { validating: 'Sprawdzamy plik', reading: 'Odczytujemy wiadomość EML', parsing: 'Rozpoznajemy oferty RocketJobs' }
function stableHash(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }; return (hash >>> 0).toString(36) }

export function ImportAnalysisPage() {
  const navigate = useNavigate(); const { mode, session } = useAppMode(); const initial = loadImportedReport()
  const [status, setStatus] = useState<ReportImportStatus>(initial.report ? 'review' : 'idle'); const [report, setReport] = useState<ImportedReport | null>(initial.report); const [visibleOfferIds, setVisibleOfferIds] = useState<string[] | null>(null); const [message, setMessage] = useState(initial.warning ?? ''); const [reviewError, setReviewError] = useState(''); const [busy, setBusy] = useState(false); const inputRef = useRef<HTMLInputElement>(null)
  const visibleOffers = report ? report.offers.filter((offer) => visibleOfferIds === null || visibleOfferIds.includes(offer.id)) : []
  async function handleFile(file: File | null) {
    const validation = validateEmlFile(file); if (!validation.valid || !file) { setStatus('error'); setMessage(validation.valid ? 'Wybierz plik raportu.' : validation.error); return }
    setMessage(''); setReviewError(''); setReport(null); setVisibleOfferIds(null); setStatus('validating'); await Promise.resolve(); setStatus('reading')
    const extraction = await extractEmlContent(file); if (!extraction.success) { setStatus('error'); setMessage(extraction.error ?? 'Nie udało się odczytać raportu.'); return }
    setStatus('parsing'); await Promise.resolve(); const parsed = parseRocketJobsReport(extraction.text); const next: ImportedReport = { version: 1, source: 'rocketjobs-eml', fileName: file.name, importedAt: new Date().toISOString(), offers: parsed.offers, warnings: parsed.warnings }
    if (!next.offers.length) { clearImportedReport(); setStatus('empty'); setMessage('Nie znaleźliśmy kompletnych ofert RocketJobs w tym raporcie.'); return }
    setReport(next); saveImportedReport(next); setStatus('review')
  }
  function chooseAnotherFile() { clearImportedReport(); setReport(null); setVisibleOfferIds(null); setMessage(''); setReviewError(''); setStatus('idle'); if (inputRef.current) inputRef.current.value = '' }
  async function startHardFilter() {
    if (!report || !mode || busy) return; setReviewError('')
    const cloudProfile = mode === 'authenticated' && session ? await supabaseProfileRepository(session.user).load() : null; const profileResult = cloudProfile ? { profile: cloudProfile.data, warning: cloudProfile.error } : loadUserProfile()
    if (!profileResult.profile) { setReviewError(profileResult.warning ?? 'Najpierw utwórz i zapisz profil, aby uruchomić Hard Filter.'); return }
    if (!canStartDemoAnalysis(visibleOffers)) { setReviewError('Lista ofert jest pusta. Przywróć oferty albo zaimportuj inny raport.'); return }
    setBusy(true)
    try {
      const userId = mode === 'authenticated' && session ? session.user.id : 'demo-user'; const repository = workspaceRepositoryFor(mode, session?.user)
      const importResult = await repository.importReport(toWorkspaceImportInput(userId, { ...report, offers: visibleOffers })); const filtered = evaluateOffers(profileResult.profile, visibleOffers); const workspace = await repository.loadWorkspace()
      const links = workspace.importOfferLinks.filter((link) => link.importSessionId === importResult.importSessionId)
      const items: HardFilterBatchItem[] = filtered.map(({ offer, result }) => { const link = links.find((entry) => entry.rawExternalId === offer.id); if (!link?.offerVersionId) throw new Error('WORKSPACE_IMPORT_LINK_MISSING'); const hardFilterStatus: HardFilterBatchItem['status'] = result.status === 'weak' ? 'needs_review' : result.status; return { jobOfferId: link.jobOfferId, offerVersionId: link.offerVersionId, status: hardFilterStatus, reasons: result.reasons, missingInformation: result.missingInformation, checkedCriteria: result.checkedCriteria } })
      await repository.persistHardFilterBatch({ profile: profileResult.profile, profileHash: stableHash(JSON.stringify(profileResult.profile)), algorithmVersion: 'hard-filter-v1', items }); clearImportedReport(); navigate('/offers')
    } catch (error) { setReviewError(error instanceof Error ? error.message : 'Nie udało się zapisać wyników Hard Filter.') } finally { setBusy(false) }
  }
  return <section className="page"><PageHeader eyebrow="Raport RocketJobs" title="Import i analiza" intro="Wczytaj raport .eml, a następnie ręcznie uruchom deterministyczny Hard Filter." /><input ref={inputRef} className="sr-only" type="file" accept=".eml,message/rfc822" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
    {status === 'idle' && <SectionCard className="dropzone-card"><div className="file-dropzone"><span className="dropzone-icon" aria-hidden="true">⇧</span><h2>Dodaj raport w formacie .eml</h2><p>Odczyt nastąpi wyłącznie w tej przeglądarce. Do workspace zapisujemy tylko znormalizowane dane ofert — bez treści EML i nagłówków wiadomości.</p><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz plik</PrimaryButton><span className="field-hint">Format .eml · maksymalnie 10 MB</span></div></SectionCard>}
    {(['validating', 'reading', 'parsing'] as const).includes(status as 'validating') && <SectionCard title="Rozpoznajemy raport"><p className="field-hint">{processingLabels[status as keyof typeof processingLabels]}</p></SectionCard>}
    {status === 'error' && <SectionCard title="Nie udało się zaimportować raportu"><Alert title="Import zatrzymany" tone="warning">{message}</Alert><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz inny plik</PrimaryButton></SectionCard>}
    {status === 'empty' && <SectionCard title="Brak ofert do przeglądu"><Alert title="Nie znaleziono kompletnych ofert" tone="warning">{message}</Alert><SecondaryButton onClick={chooseAnotherFile}>Wróć</SecondaryButton></SectionCard>}
    {status === 'review' && report && <SectionCard title="Rozpoznane oferty"><Alert title="Analiza nie uruchamia się automatycznie" tone="info">Po kliknięciu zapiszemy import oraz wynik Hard Filter w trwałym workspace. AI nie jest uruchamiane w R1.4.</Alert>{reviewError && <Alert title="Nie można ukończyć Hard Filter" tone="warning">{reviewError}</Alert>}<p className="file-name">{report.fileName} <span>· {visibleOffers.length} z {report.offers.length} ofert</span></p><ul className="recognized-offers">{visibleOffers.map((offer) => <li key={offer.id}><div><strong>{offer.title}</strong><span>{offer.company}{offer.location ? ` · ${offer.location}` : ''}</span></div><SecondaryButton onClick={() => setVisibleOfferIds((current) => (current ?? report.offers.map((item) => item.id)).filter((id) => id !== offer.id))}>Usuń</SecondaryButton></li>)}</ul><div className="action-row"><SecondaryButton onClick={() => setVisibleOfferIds(restoreImportedOffers(report.offers).map((offer) => offer.id))} disabled={busy}>Przywróć listę</SecondaryButton><SecondaryButton onClick={() => inputRef.current?.click()} disabled={busy}>Wybierz inny plik</SecondaryButton><PrimaryButton disabled={!canStartDemoAnalysis(visibleOffers) || busy} onClick={() => void startHardFilter()}>{busy ? 'Zapisujemy wyniki…' : 'Uruchom Hard Filter'}</PrimaryButton></div></SectionCard>}
  </section>
}

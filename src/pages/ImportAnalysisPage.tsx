import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ImportedReport, ReportImportStatus } from '../contracts/import'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { demoOffers } from '../demo/offers'
import { extractEmlContent } from '../features/import/emlExtractor'
import { clearImportedReport, loadImportedReport, saveImportedReport } from '../features/import/importSessionStorage'
import { canStartDemoAnalysis, restoreImportedOffers } from '../features/import/importReviewState'
import { validateEmlFile } from '../features/import/importUtils'
import { parseRocketJobsReport } from '../features/import/rocketJobsReportParser'

const processingLabels: Record<Extract<ReportImportStatus, 'validating' | 'reading' | 'parsing'>, string> = { validating: 'Sprawdzamy plik', reading: 'Odczytujemy wiadomość EML', parsing: 'Rozpoznajemy oferty RocketJobs' }

export function ImportAnalysisPage() {
  const navigate = useNavigate()
  const initial = loadImportedReport()
  const [status, setStatus] = useState<ReportImportStatus>(initial.report ? 'review' : 'idle')
  const [report, setReport] = useState<ImportedReport | null>(initial.report)
  const [visibleOfferIds, setVisibleOfferIds] = useState<string[] | null>(null)
  const [message, setMessage] = useState(initial.warning ?? '')
  const [analysisStep, setAnalysisStep] = useState(1)
  const inputRef = useRef<HTMLInputElement>(null)
  const visibleOffers = report ? report.offers.filter((offer) => visibleOfferIds === null || visibleOfferIds.includes(offer.id)) : []
  const progress = Math.round((analysisStep / demoOffers.length) * 100)

  async function handleFile(file: File | null) {
    const validation = validateEmlFile(file)
    if (!validation.valid || !file) { setStatus('error'); setMessage(validation.valid ? 'Wybierz plik raportu.' : validation.error); return }
    setMessage(''); setReport(null); setVisibleOfferIds(null); setStatus('validating')
    await Promise.resolve(); setStatus('reading')
    const extraction = await extractEmlContent(file)
    if (!extraction.success) { setStatus('error'); setMessage(extraction.error ?? 'Nie udało się odczytać raportu.'); return }
    setStatus('parsing'); await Promise.resolve()
    const parsed = parseRocketJobsReport(extraction.text)
    const nextReport: ImportedReport = { version: 1, source: 'rocketjobs-eml', fileName: file.name, importedAt: new Date().toISOString(), offers: parsed.offers, warnings: parsed.warnings }
    if (!nextReport.offers.length) { clearImportedReport(); setStatus('empty'); setMessage('Nie znaleźliśmy kompletnych ofert RocketJobs w tym raporcie.'); return }
    setReport(nextReport); saveImportedReport(nextReport)
    setStatus('review')
  }

  function chooseAnotherFile() { clearImportedReport(); setReport(null); setVisibleOfferIds(null); setMessage(''); setStatus('idle'); if (inputRef.current) inputRef.current.value = '' }
  function deleteOffer(id: string) { setVisibleOfferIds((current) => (current ?? report?.offers.map((offer) => offer.id) ?? []).filter((offerId) => offerId !== id)) }
  function restoreOffers() { if (report) setVisibleOfferIds(restoreImportedOffers(report.offers).map((offer) => offer.id)) }
  function startDemoAnalysis() { if (!canStartDemoAnalysis(visibleOffers)) return; setAnalysisStep(1); setStatus('success') }
  function advanceAnalysis() { if (analysisStep >= demoOffers.length) navigate('/offers'); else setAnalysisStep((step) => step + 1) }

  return <section className="page">
    <PageHeader eyebrow="Raport RocketJobs" title="Import i analiza" intro="Wczytaj lokalny raport .eml, sprawdź rozpoznane oferty, a następnie ręcznie uruchom demonstracyjną warstwę analizy." />
    <input ref={inputRef} className="sr-only" type="file" accept=".eml,message/rfc822" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
    {status === 'idle' && <SectionCard className="dropzone-card"><div className="file-dropzone"><span className="dropzone-icon" aria-hidden="true">⇧</span><h2>Dodaj raport w formacie .eml</h2><p>Odczyt nastąpi wyłącznie w tej przeglądarce. Zapisujemy jedynie znormalizowane dane ofert na czas sesji — bez treści EML i nagłówków wiadomości.</p><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz plik</PrimaryButton><span className="field-hint">Format .eml · maksymalnie 10 MB</span></div></SectionCard>}
    {(['validating', 'reading', 'parsing'] as const).includes(status as 'validating') && <SectionCard title="Rozpoznajemy raport"><p className="file-name">{inputRef.current?.files?.[0]?.name ?? 'Wybrany raport'} <span>· lokalne przetwarzanie</span></p><div className="progress-track progress-track--large" aria-label="Postęp importu"><span style={{ width: status === 'validating' ? '22%' : status === 'reading' ? '56%' : '82%' }} /></div><ol className="process-steps"><li className={status !== 'validating' ? 'is-complete' : 'is-active'}>Sprawdzamy plik</li><li className={status === 'parsing' ? 'is-complete' : status === 'reading' ? 'is-active' : ''}>Odczytujemy raport</li><li className={status === 'parsing' ? 'is-active' : ''}>Rozpoznajemy oferty</li></ol><p className="field-hint">{processingLabels[status as keyof typeof processingLabels]}</p></SectionCard>}
    {status === 'error' && <SectionCard title="Nie udało się zaimportować raportu"><Alert title="Import zatrzymany" tone="warning">{message}</Alert><div className="action-row"><SecondaryButton onClick={chooseAnotherFile}>Wróć</SecondaryButton><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz inny plik</PrimaryButton></div></SectionCard>}
    {status === 'empty' && <SectionCard title="Brak ofert do przeglądu"><Alert title="Nie znaleziono kompletnych ofert" tone="warning">{message}</Alert><p>Raport nie został użyty do analizy. Możesz wybrać inny plik lub wrócić później.</p><div className="action-row"><SecondaryButton onClick={chooseAnotherFile}>Wróć</SecondaryButton><PrimaryButton onClick={() => inputRef.current?.click()}>Wybierz inny plik</PrimaryButton></div></SectionCard>}
    {status === 'review' && report && <SectionCard title="Rozpoznane oferty"><Alert title="Analiza nie uruchamia się automatycznie" tone="info">Potwierdź listę ofert. Przejście dalej nadal użyje istniejącej, statycznej demonstracji wyników.</Alert><p className="file-name">{report.fileName} <span>· {visibleOffers.length} z {report.offers.length} ofert</span></p>{report.warnings.map((warning, index) => <p className="import-warning" key={`${warning.code}-${index}`}>{warning.message}</p>)}<ul className="recognized-offers">{visibleOffers.map((offer) => <li key={offer.id}><div><strong>{offer.title}</strong><span>{offer.company}{offer.location ? ` · ${offer.location}` : ''}</span>{offer.missingFields.length > 0 && <small>Brak: {offer.missingFields.join(', ')}</small>}</div><SecondaryButton onClick={() => deleteOffer(offer.id)}>Usuń</SecondaryButton></li>)}</ul>{visibleOffers.length === 0 && <Alert title="Lista jest pusta" tone="warning">Przywróć oferty albo wybierz inny raport.</Alert>}<div className="action-row"><SecondaryButton onClick={restoreOffers} disabled={visibleOffers.length === report.offers.length}>Przywróć listę</SecondaryButton><SecondaryButton onClick={() => inputRef.current?.click()}>Wybierz inny plik</SecondaryButton><PrimaryButton disabled={!canStartDemoAnalysis(visibleOffers)} onClick={startDemoAnalysis}>Analizuj oferty</PrimaryButton></div></SectionCard>}
    {status === 'success' && <SectionCard title="Analiza demonstracyjna w toku"><Alert title="Co dalej?" tone="warning">Rozpoznaliśmy {visibleOffers.length} rzeczywistych ofert z raportu, ale oceny, rekomendacje i postęp poniżej nadal pochodzą ze statycznego demo. Nie są przypisane do zaimportowanych ofert.</Alert><p>Przeanalizowano <strong>{analysisStep}/{demoOffers.length}</strong> ofert demonstracyjnych.</p><div className="progress-track progress-track--large" aria-label={`Postęp demonstracyjnej analizy: ${progress}%`}><span style={{ width: `${progress}%` }} /></div><ul className="analysis-list">{demoOffers.map((offer, index) => <li key={offer.id}><span>{offer.title}</span><span className={index < analysisStep ? 'analysis-state analysis-state--done' : index === analysisStep ? 'analysis-state analysis-state--current' : 'analysis-state'}>{index < analysisStep ? 'Zakończona' : index === analysisStep ? 'Analizowana' : 'Oczekuje'}</span></li>)}</ul><PrimaryButton onClick={advanceAnalysis}>{analysisStep >= demoOffers.length ? 'Zobacz wyniki demo' : 'Kontynuuj demonstrację'}</PrimaryButton></SectionCard>}
  </section>
}

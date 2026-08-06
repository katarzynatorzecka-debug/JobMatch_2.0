import { useMemo, useRef, useState } from 'react'
import type { ImportedReport, ImportWarning } from '../contracts/import'
import { Alert, PageHeader, PrimaryButton, SecondaryButton, SectionCard } from '../components/ui'
import { extractEmlContent } from '../features/import/emlExtractor'
import {
  appendBatchEntries,
  createImportBatchId,
  createImportBatchState,
  hasRemovedOffers,
  markBatchReady,
  removeBatchOffer,
  removeBatchReport,
  restoreBatchOffers,
  summarizeBatch,
  visibleOffers,
  type ImportBatchEntry,
} from '../features/import/importBatchState'
import { validateEmlFile } from '../features/import/importUtils'
import { parseRocketJobsReport } from '../features/import/rocketJobsReportParser'

const processingLabels = {
  adding_files: 'Przygotowujemy wybrane pliki.',
  reading: 'Odczytujemy wiadomości EML lokalnie w przeglądarce.',
  parsing: 'Rozpoznajemy oferty RocketJobs i pola wymagające sprawdzenia.',
} as const

function parserWarnings(warnings: string[]): ImportWarning[] {
  return warnings.map((message) => ({ code: 'partial-parse' as const, message }))
}

export function ImportAnalysisPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const sequenceRef = useRef(0)
  const [batch, setBatch] = useState(createImportBatchState)
  const [isProcessing, setIsProcessing] = useState(false)
  const [readyMessage, setReadyMessage] = useState('')
  const summary = useMemo(() => summarizeBatch(batch), [batch])

  function openFilePicker() {
    inputRef.current?.click()
  }

  async function handleFiles(files: FileList | null) {
    const selectedFiles = files ? Array.from(files) : []
    if (!selectedFiles.length || isProcessing) return
    setReadyMessage('')
    setIsProcessing(true)
    setBatch((current) => ({ ...current, status: 'adding_files' }))
    await Promise.resolve()
    const entries: ImportBatchEntry[] = []

    for (const file of selectedFiles) {
      const id = createImportBatchId(file.name, sequenceRef.current++)
      const validation = validateEmlFile(file)
      if (!validation.valid) {
        entries.push({ kind: 'file_error', id, fileName: file.name, message: validation.error })
        continue
      }

      setBatch((current) => ({ ...current, status: 'reading' }))
      const extraction = await extractEmlContent(file)
      if (!extraction.success) {
        entries.push({ kind: 'file_error', id, fileName: file.name, message: extraction.error ?? 'Nie udało się odczytać raportu.' })
        continue
      }

      setBatch((current) => ({ ...current, status: 'parsing' }))
      const parsed = parseRocketJobsReport(extraction.text)
      if (!parsed.offers.length) {
        entries.push({ kind: 'file_error', id, fileName: file.name, message: parsed.warnings[0]?.message ?? 'Nie znaleźliśmy kompletnych ofert RocketJobs w tym raporcie.' })
        continue
      }

      const report: ImportedReport = {
        version: 1,
        source: 'rocketjobs-eml',
        fileName: file.name,
        importedAt: new Date().toISOString(),
        offers: parsed.offers,
        warnings: [...parsed.warnings, ...parserWarnings(extraction.warnings)],
      }
      entries.push({ kind: 'report', id, report, removedOfferIds: [] })
    }

    setBatch((current) => appendBatchEntries(current, entries))
    setIsProcessing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function startOver() {
    sequenceRef.current = 0
    setBatch(createImportBatchState())
    setReadyMessage('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function markReady() {
    setBatch((current) => markBatchReady(current))
    setReadyMessage('Paczka jest gotowa do analizy. W tej fazie nie uruchamiamy jeszcze Hard Filter, AI ani zapisu do workspace.')
  }

  const isReviewing = batch.entries.length > 0 && !isProcessing

  return <section className="page">
    <PageHeader eyebrow="Raport RocketJobs" title="Import i analiza" intro="Przygotuj paczkę raportów .eml. Odczyt i przegląd pozostają lokalnie w przeglądarce — bez uruchamiania analizy na tym etapie." />
    <input ref={inputRef} className="sr-only" type="file" multiple accept=".eml,message/rfc822" onChange={(event) => void handleFiles(event.target.files)} />

    {(['adding_files', 'reading', 'parsing'] as const).includes(batch.status as keyof typeof processingLabels) && <SectionCard title="Przygotowujemy paczkę"><p className="field-hint">{processingLabels[batch.status as keyof typeof processingLabels]}</p></SectionCard>}

    {!isReviewing && !isProcessing && <SectionCard className="dropzone-card">
      <div className="file-dropzone">
        <span className="dropzone-icon" aria-hidden="true">⇧</span>
        <h2>Dodaj raporty w formacie .eml</h2>
        <p>Możesz wybrać kilka raportów naraz lub dodawać je później. Nie przechowujemy treści EML, nagłówków wiadomości ani CV w chmurze.</p>
        <PrimaryButton onClick={openFilePicker}>Wybierz raporty</PrimaryButton>
        <span className="field-hint">Format .eml · maksymalnie 10 MB na plik</span>
      </div>
    </SectionCard>}

    {isReviewing && <>
      <SectionCard title="Przegląd paczki przed analizą" className="import-review-card">
        <Alert title="Etap przygotowania paczki" tone="info">Sprawdź rozpoznane oferty, warningi i braki danych. Statusy „new”, „exact reuse” oraz wynik importu do workspace pojawią się dopiero po persistencji w późniejszej fazie.</Alert>
        {batch.status === 'partial_review' && <Alert title="Część plików wymaga uwagi" tone="warning">Poprawne raporty pozostały w paczce. Błędny plik nie usunął rozpoznanych ofert.</Alert>}
        {batch.status === 'file_error' && <Alert title="Plik wymaga poprawy" tone="warning">Nie udało się rozpoznać żadnego poprawnego raportu. Możesz dodać kolejny plik albo zacząć od nowa.</Alert>}
        {readyMessage && <Alert title="Paczka gotowa" tone="info">{readyMessage}</Alert>}

        <div className="batch-summary" aria-label="Podsumowanie paczki">
          <span><strong>{summary.reportCount}</strong> raporty</span>
          <span><strong>{summary.visibleOfferCount}</strong> widoczne oferty</span>
          <span><strong>{summary.warningCount}</strong> warningi</span>
          <span><strong>{summary.missingFieldCount}</strong> braki pól</span>
        </div>
        {summary.localDuplicateCount > 0 && <Alert title="Możliwe powtórzenia w bieżącej paczce" tone="info">Wykryliśmy {summary.localDuplicateCount} lokalne powtórzenia według linku źródłowego lub pary firma/stanowisko. Nie łączymy ich ani nie zapisujemy decyzji na tym etapie.</Alert>}

        <ul className="import-report-list" aria-label="Wybrane raporty">
          {batch.entries.map((entry) => entry.kind === 'file_error'
            ? <li key={entry.id} className="import-report-list__error"><div><strong>{entry.fileName}</strong><span>Nie udało się przygotować pliku</span></div><Alert title="Plik pominięty" tone="warning">{entry.message}</Alert></li>
            : <li key={entry.id}>
              <div className="import-report-list__heading"><div><strong>{entry.report.fileName}</strong><span>Rozpoznano {entry.report.offers.length} ofert · widoczne {visibleOffers(entry).length}</span></div><SecondaryButton onClick={() => setBatch((current) => removeBatchReport(current, entry.id))} disabled={isProcessing}>Usuń raport</SecondaryButton></div>
              {entry.report.warnings.length > 0 && <ul className="import-warnings">{entry.report.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul>}
              <ul className="recognized-offers">
                {visibleOffers(entry).map((offer) => <li key={offer.id}><div><strong>{offer.title}</strong><span>{offer.company}{offer.sourceLabel ? ` · ${offer.sourceLabel}` : ''}{offer.location ? ` · ${offer.location}` : ''}</span>{offer.missingFields.length > 0 && <small>Brakuje: {offer.missingFields.join(', ')}.</small>}{offer.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div><SecondaryButton onClick={() => setBatch((current) => removeBatchOffer(current, entry.id, offer.id))} disabled={isProcessing}>Usuń ofertę</SecondaryButton></li>)}
              </ul>
            </li>)}
        </ul>

        <div className="action-row action-row--spaced">
          <SecondaryButton onClick={openFilePicker} disabled={isProcessing}>Dodaj kolejny raport</SecondaryButton>
          <SecondaryButton onClick={() => setBatch((current) => restoreBatchOffers(current))} disabled={!hasRemovedOffers(batch) || isProcessing}>Przywróć listę</SecondaryButton>
          <SecondaryButton onClick={startOver} disabled={isProcessing}>Zacznij od nowa</SecondaryButton>
          <PrimaryButton disabled={summary.visibleOfferCount === 0 || isProcessing || batch.status === 'ready_to_analyze'} onClick={markReady}>{batch.status === 'ready_to_analyze' ? 'Paczka gotowa do analizy' : 'Przeprowadź analizę'}</PrimaryButton>
        </div>
      </SectionCard>
    </>}
  </section>
}

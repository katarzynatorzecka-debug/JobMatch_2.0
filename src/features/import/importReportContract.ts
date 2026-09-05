import type { ImportedReport, OfferImportSource, ReportAcquisitionChannel, ReportProvider } from '../../contracts/import'

const sourceMetadata: Record<OfferImportSource, { reportProvider: ReportProvider; acquisitionChannel: ReportAcquisitionChannel }> = {
  'rocketjobs-eml': { reportProvider: 'rocketjobs', acquisitionChannel: 'eml' },
  'rocketjobs-gmail': { reportProvider: 'rocketjobs', acquisitionChannel: 'gmail' },
  'job-url': { reportProvider: 'rocketjobs', acquisitionChannel: 'url' },
}

export function metadataForImportSource(source: OfferImportSource) {
  return sourceMetadata[source]
}

export function importSourceFor(channel: ReportAcquisitionChannel, provider: ReportProvider): OfferImportSource {
  if (provider !== 'rocketjobs') throw new Error('IMPORT_PROVIDER_UNSUPPORTED')
  if (channel === 'eml') return 'rocketjobs-eml'
  if (channel === 'gmail') return 'rocketjobs-gmail'
  return 'job-url'
}

export function createImportedReport(input: Omit<ImportedReport, 'version' | 'source'> & { source?: OfferImportSource }): ImportedReport {
  const source = input.source ?? importSourceFor(input.acquisitionChannel, input.reportProvider)
  const expected = sourceMetadata[source]
  if (expected.reportProvider !== input.reportProvider || expected.acquisitionChannel !== input.acquisitionChannel) {
    throw new Error('IMPORT_SOURCE_METADATA_MISMATCH')
  }
  return { ...input, version: 2, source }
}

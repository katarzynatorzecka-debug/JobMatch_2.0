export type OfferImportSource = 'rocketjobs-eml' | 'rocketjobs-gmail' | 'job-url'
export type ReportProvider = 'rocketjobs'
export type ReportAcquisitionChannel = 'eml' | 'gmail' | 'url'

export type ReportImportStatus = 'idle' | 'validating' | 'reading' | 'parsing' | 'success' | 'empty' | 'error' | 'review'

export interface ImportWarning {
  code: 'missing-field' | 'duplicate' | 'partial-parse' | 'unsupported-layout'
  message: string
  offerId?: string
}

export interface ImportedJobOffer {
  id: string
  title: string
  company: string
  location?: string
  workMode?: string
  contractType?: string
  salary?: string
  sourceUrl?: string
  sourceLabel?: string
  missingFields: string[]
  warnings: string[]
}

export interface ImportedReport {
  version: 2
  source: OfferImportSource
  reportProvider: ReportProvider
  acquisitionChannel: ReportAcquisitionChannel
  fileName: string
  importedAt: string
  offers: ImportedJobOffer[]
  warnings: ImportWarning[]
}

export interface EmlExtractionResult {
  success: boolean
  text: string
  characterCount: number
  warnings: string[]
  error?: string
}

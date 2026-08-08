export type OfferImportSource = 'rocketjobs-eml' | 'job-url'

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
  version: 1
  source: OfferImportSource
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

import type { ProfilePresentationMetadata } from './profilePresentation'

export type CvSource = 'pdf' | 'pasted-text'
export type CvImportStatus = 'idle' | 'reading' | 'extracting' | 'success' | 'error' | 'fallback' | 'review'
export type ProfileFieldConfidence = 'high' | 'medium' | 'low' | 'missing' | 'manual'
export type ProfilePriority = 'experience' | 'skills' | 'preferences' | 'growth'
export type WorkMode = 'remote' | 'hybrid' | 'onsite'
export type ContractType = 'employment' | 'b2b' | 'mandate' | 'freelance' | 'internship'

export interface UserProfile {
  primaryRole: string
  alternativeRoles: string[]
  experienceSummary: string
  skills: string[]
  acceptedWorkModes: WorkMode[]
  acceptedContractTypes: ContractType[]
  acceptedLocations: string[]
  minimumSalary: number | null
  studentStatusAvailable: boolean
  excludedContractTypes: ContractType[]
  excludedWorkModes: WorkMode[]
  excludedKeywords: string[]
  requiresStudentStatus: boolean
  additionalMustHave: string
  additionalBlacklist: string
  priorities: ProfilePriority[]
}

export type DraftProfileValues = UserProfile

export interface UserProfileDraft {
  values: DraftProfileValues
  confidence: Record<'primaryRole' | 'alternativeRoles' | 'experienceSummary' | 'skills', ProfileFieldConfidence>
  warnings: string[]
  source: CvSource
  requiresAcceptance: true
  presentation?: ProfilePresentationMetadata
}

export interface CvExtractionResult {
  success: boolean
  source: CvSource
  text: string
  characterCount: number
  quality: 'good' | 'low' | 'empty'
  warnings: string[]
  pageCount?: number
}

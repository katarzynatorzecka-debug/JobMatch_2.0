import type { ProfilePresentationMetadata } from './profilePresentation'

export type CvSource = 'pdf' | 'pasted-text'
export type CvImportStatus = 'idle' | 'reading' | 'extracting' | 'success' | 'error' | 'fallback' | 'review'
export type ProfileFieldConfidence = 'high' | 'medium' | 'low' | 'missing' | 'manual'
export type ProfileDraftFieldStatus = 'extracted' | 'inferred' | 'unknown'
export type ProfilePriority = 'experience' | 'skills' | 'preferences' | 'growth'
export type WorkMode = 'remote' | 'hybrid' | 'onsite'
export type ContractType = 'employment' | 'b2b' | 'mandate' | 'freelance' | 'internship'
export type ProfileFactSource = 'cv' | 'user' | 'derived'
export type SkillEvidenceLevel = 'professional' | 'project' | 'learning' | 'mentioned'
export type ExperienceRecency = 'current' | 'recent' | 'earlier' | 'unknown'
export type TargetSeniority = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'manager' | 'unknown'

export interface ProfileEvidence {
  source: ProfileFactSource
  text: string
  section: string | null
  userConfirmed: boolean
}

export interface ProfileFactQuality { confidence?: number | null; status?: ProfileDraftFieldStatus }
export interface ExperienceArea extends ProfileFactQuality { area: string; yearsApprox: number | null; recency: ExperienceRecency; evidence: ProfileEvidence[] }
export interface ProfileSkill extends ProfileFactQuality { name: string; category: string | null; evidenceLevel: SkillEvidenceLevel; yearsApprox: number | null; recency: ExperienceRecency; evidence: ProfileEvidence[] }
export interface ProfileCapability extends ProfileFactQuality { capability: string; evidence: ProfileEvidence[] }
export interface ProfileDomain extends ProfileFactQuality { name: string; yearsApprox: number | null; evidence: ProfileEvidence[] }
export interface ProfileLanguage extends ProfileFactQuality { name: string; level: string | null; evidence: ProfileEvidence[] }
export interface ProfileCredential extends ProfileFactQuality { name: string; issuer: string | null; evidence: ProfileEvidence[] }
export interface ProfileExperienceEntry extends ProfileFactQuality { role: string; company: string | null; startDate: string | null; endDate: string | null; duration: string | null; responsibilities: ProfileCapability[]; achievements: ProfileCapability[]; domains: ProfileDomain[]; evidence: ProfileEvidence[] }
export interface HardPreference<T extends string> { value: T; isHard: boolean; source: ProfileFactSource; userConfirmed: boolean }

export interface ProfileIntelligence {
  schemaVersion: 2
  candidateFacts: {
    professionalSummary: string
    totalExperienceYears: number | null
    experienceEntries: ProfileExperienceEntry[]
    experienceAreas: ExperienceArea[]
    skills: ProfileSkill[]
    responsibilities: ProfileCapability[]
    domains: ProfileDomain[]
    achievements: ProfileCapability[]
    languages: ProfileLanguage[]
    education: ProfileCredential[]
    certifications: ProfileCredential[]
  }
  careerTargets: { primaryRoles: string[]; alternativeRoles: string[]; targetSeniority: TargetSeniority[]; careerDirections: string[]; transitionContext: string | null }
  workPreferences: { locations: HardPreference<string>[]; workModes: HardPreference<WorkMode>[]; employmentTypes: HardPreference<ContractType>[]; minimumSalary: number | null; availability: string | null; relocation: string | null }
  constraints: { mustHave: string[]; blacklist: string[] }
  matchingPriorities: ProfilePriority[]
}

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
  intelligence?: ProfileIntelligence
}

export type DraftProfileValues = UserProfile

export interface ProfileFieldProvenance<T> {
  value: T
  evidence: string[]
  confidence: number
  status: ProfileDraftFieldStatus
}

export interface ProfileDraftProvenance {
  fullName: ProfileFieldProvenance<string>
  primaryRole: ProfileFieldProvenance<string>
  alternativeRoles: ProfileFieldProvenance<string[]>
  experienceSummary: ProfileFieldProvenance<string>
  skills: ProfileFieldProvenance<string[]>
  locations: ProfileFieldProvenance<string[]>
  workModes: ProfileFieldProvenance<WorkMode[]>
  contractTypes: ProfileFieldProvenance<ContractType[]>
}

export interface UserProfileDraft {
  values: DraftProfileValues
  confidence: Record<'primaryRole' | 'alternativeRoles' | 'experienceSummary' | 'skills', ProfileFieldConfidence>
  warnings: string[]
  source: CvSource
  requiresAcceptance: true
  presentation?: ProfilePresentationMetadata
  provenance?: ProfileDraftProvenance
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

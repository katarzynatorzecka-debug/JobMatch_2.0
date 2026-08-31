import type { CvSource, ProfileDraftFieldStatus, ProfileFieldConfidence, UserProfileDraft } from '../../contracts/profile'
import { semanticProfileResponseSchema, type SemanticProfileMapping } from '../../schemas/profileSemanticSchemas'
import { supabase } from '../supabase/client'
import { defaultProfile } from './profileDefaults'
import { applyProfileIntelligence, profileIntelligenceFromLegacy, sanitizeEvidenceText } from './profileIntelligence'

export class SemanticProfileMappingError extends Error {
  constructor(public readonly code: string) { super(code) }
}

function confidenceFor(status: ProfileDraftFieldStatus, confidence: number): ProfileFieldConfidence {
  if (status === 'unknown') return 'missing'
  if (status === 'inferred') return 'low'
  return confidence >= .8 ? 'high' : 'medium'
}

function warningFor(label: string, status: ProfileDraftFieldStatus) {
  return status === 'unknown' ? `Brak danych z CV: ${label}.` : status === 'inferred' ? `Do sprawdzenia: ${label} jest interpretacją wspartą fragmentem CV.` : null
}

export function semanticMappingToDraft(mapping: SemanticProfileMapping, source: CvSource): UserProfileDraft {
  const fields = [
    ['roli głównej', mapping.primaryRole.status], ['podsumowania doświadczenia', mapping.professionalSummary.status],
    ['umiejętności', mapping.skills.status], ['ról alternatywnych', mapping.alternativeRoles.status],
  ] as const
  const warnings = fields.map(([label, status]) => warningFor(label, status)).filter((value): value is string => Boolean(value))
  const legacyValues = {
      ...defaultProfile,
      primaryRole: mapping.primaryRole.value,
      alternativeRoles: mapping.alternativeRoles.value,
      experienceSummary: mapping.professionalSummary.value,
      skills: mapping.skills.value,
      acceptedLocations: mapping.locations.value,
      acceptedWorkModes: mapping.workModes.value,
      acceptedContractTypes: mapping.contractTypes.value,
    }
  const intelligence = profileIntelligenceFromLegacy(legacyValues)
  intelligence.candidateFacts.professionalSummary = mapping.professionalSummary.value
  const evidenceFor = (items: string[]) => items.map((text) => ({ source: 'cv' as const, text: sanitizeEvidenceText(text), section: null, userConfirmed: false })).filter((item) => Boolean(item.text))
  const qualityFor = (item: { confidence: number; status: ProfileDraftFieldStatus }) => ({ confidence: item.confidence, status: item.status })
  const facts = mapping.candidateFacts
  intelligence.candidateFacts.totalExperienceYears = facts.totalExperienceYears.value
  intelligence.candidateFacts.experienceEntries = facts.experienceEntries.filter((item) => item.status !== 'unknown').map((item) => ({ role: item.role, company: item.company, startDate: item.startDate, endDate: item.endDate, duration: item.duration, evidence: evidenceFor(item.evidence), ...qualityFor(item), responsibilities: item.responsibilities.filter((value) => value.status !== 'unknown').map((value) => ({ capability: value.capability, evidence: evidenceFor(value.evidence), ...qualityFor(value) })), achievements: item.achievements.filter((value) => value.status !== 'unknown').map((value) => ({ capability: value.capability, evidence: evidenceFor(value.evidence), ...qualityFor(value) })), domains: item.domains.filter((value) => value.status !== 'unknown').map((value) => ({ name: value.name, yearsApprox: value.yearsApprox, evidence: evidenceFor(value.evidence), ...qualityFor(value) })) }))
  intelligence.candidateFacts.experienceAreas = facts.experienceAreas.filter((item) => item.status !== 'unknown').map((item) => ({ area: item.area, yearsApprox: item.yearsApprox, recency: item.recency, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  const detailedSkills = new Map(facts.skills.filter((item) => item.status !== 'unknown').map((item) => [item.name.toLocaleLowerCase(), item]))
  intelligence.candidateFacts.skills = mapping.skills.status === 'unknown' ? [] : mapping.skills.value.map((name) => {
    const detail = detailedSkills.get(name.toLocaleLowerCase())
    return detail ? { name, category: detail.category, evidenceLevel: detail.evidenceLevel, yearsApprox: detail.yearsApprox, recency: detail.recency, evidence: evidenceFor(detail.evidence), ...qualityFor(detail) } : { name, category: null, evidenceLevel: 'mentioned' as const, yearsApprox: null, recency: 'unknown' as const, evidence: evidenceFor(mapping.skills.evidence), confidence: mapping.skills.confidence, status: mapping.skills.status }
  })
  intelligence.candidateFacts.responsibilities = facts.responsibilities.filter((item) => item.status !== 'unknown').map((item) => ({ capability: item.capability, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  intelligence.candidateFacts.domains = facts.domains.filter((item) => item.status !== 'unknown').map((item) => ({ name: item.name, yearsApprox: item.yearsApprox, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  intelligence.candidateFacts.achievements = facts.achievements.filter((item) => item.status !== 'unknown').map((item) => ({ capability: item.capability, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  intelligence.candidateFacts.languages = facts.languages.filter((item) => item.status !== 'unknown').map((item) => ({ name: item.name, level: item.level, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  intelligence.candidateFacts.education = facts.education.filter((item) => item.status !== 'unknown').map((item) => ({ name: item.name, issuer: item.issuer, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  intelligence.candidateFacts.certifications = facts.certifications.filter((item) => item.status !== 'unknown').map((item) => ({ name: item.name, issuer: item.issuer, evidence: evidenceFor(item.evidence), ...qualityFor(item) }))
  intelligence.careerTargets.primaryRoles = mapping.primaryRole.value ? [mapping.primaryRole.value] : []
  intelligence.careerTargets.alternativeRoles = mapping.alternativeRoles.value
  return {
    values: applyProfileIntelligence(legacyValues, intelligence),
    confidence: {
      primaryRole: confidenceFor(mapping.primaryRole.status, mapping.primaryRole.confidence),
      alternativeRoles: confidenceFor(mapping.alternativeRoles.status, mapping.alternativeRoles.confidence),
      experienceSummary: confidenceFor(mapping.professionalSummary.status, mapping.professionalSummary.confidence),
      skills: confidenceFor(mapping.skills.status, mapping.skills.confidence),
    },
    warnings,
    source,
    requiresAcceptance: true,
    presentation: { fullName: mapping.fullName.value || null, source: mapping.fullName.value ? 'cv' : 'none' },
    provenance: {
      fullName: mapping.fullName,
      primaryRole: mapping.primaryRole,
      alternativeRoles: mapping.alternativeRoles,
      experienceSummary: mapping.professionalSummary,
      skills: mapping.skills,
      locations: mapping.locations,
      workModes: mapping.workModes,
      contractTypes: mapping.contractTypes,
    },
  }
}

export async function mapCvTextSemantically(cvText: string, source: CvSource): Promise<UserProfileDraft> {
  if (!supabase) throw new SemanticProfileMappingError('CV_MAPPER_UNAVAILABLE')
  const { data, error } = await supabase.functions.invoke('map-cv-profile', { body: { text: cvText.slice(0, 30_000) } })
  if (error) throw new SemanticProfileMappingError('CV_MAPPER_REQUEST_FAILED')
  const parsed = semanticProfileResponseSchema.safeParse(data)
  if (!parsed.success) throw new SemanticProfileMappingError('CV_MAPPER_INVALID_RESPONSE')
  return semanticMappingToDraft(parsed.data.mapping, source)
}

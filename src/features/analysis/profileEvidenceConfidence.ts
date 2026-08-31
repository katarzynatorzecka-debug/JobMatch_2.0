import type { ProfileEvidence, SkillEvidenceLevel, UserProfile } from '../../contracts/profile'

const skillLevelConfidence: Record<SkillEvidenceLevel, number> = { professional: 90, project: 75, learning: 55, mentioned: 45 }
const sourceConfidence: Record<ProfileEvidence['source'], number> = { user: 95, cv: 80, derived: 50 }

export function confidenceFromProfileEvidence(evidence: ProfileEvidence[], skillLevel?: SkillEvidenceLevel): number {
  const evidenceScore = evidence.length ? Math.round(evidence.reduce((total, item) => total + (item.userConfirmed ? 95 : sourceConfidence[item.source]), 0) / evidence.length) : 0
  return skillLevel ? Math.round((evidenceScore * 0.6) + (skillLevelConfidence[skillLevel] * 0.4)) : evidenceScore
}

/** A bounded, deterministic ceiling for AI criterion confidence. */
export function profileEvidenceConfidence(profile: Pick<UserProfile, 'intelligence'>): number | null {
  const facts = profile.intelligence?.candidateFacts
  if (!facts) return null
  const values = [
    ...facts.experienceAreas.map((item) => confidenceFromProfileEvidence(item.evidence)),
    ...facts.skills.map((item) => confidenceFromProfileEvidence(item.evidence, item.evidenceLevel)),
    ...facts.responsibilities.map((item) => confidenceFromProfileEvidence(item.evidence)),
    ...facts.domains.map((item) => confidenceFromProfileEvidence(item.evidence)),
  ].filter((value) => value > 0)
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null
}

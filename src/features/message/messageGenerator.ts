import type { JobAnalysis } from '../../contracts/jobAnalysis'
import type { UserProfile } from '../../contracts/profile'
import type { WorkspaceJobOffer } from '../../contracts/workspace'
import { criterionOutcomeLabel } from '../workspace/presentationLabels'

export type MessageTone = 'Naturalny' | 'Formalny' | 'Bezpośredni'

const rawCriterionOutcomePattern = /\b(MATCH|PARTIAL|NO_MATCH|UNKNOWN)\b/g

function sanitizeAnalysisText(value: string): string {
  return value.replace(rawCriterionOutcomePattern, (outcome) => criterionOutcomeLabel(outcome))
}

const introductions: Record<MessageTone, string> = {
  Naturalny: 'Dzień dobry,\n\nzainteresowała mnie oferta',
  Formalny: 'Szanowni Państwo,\n\nchciałabym wyrazić zainteresowanie ofertą',
  Bezpośredni: 'Dzień dobry,\n\npiszę w sprawie oferty',
}

export function createMessage(tone: MessageTone, offer: WorkspaceJobOffer, profile: UserProfile, analysis: JobAnalysis | null) {
  const profileParts = [
    profile.primaryRole.trim() ? `Moje doświadczenie obejmuje obszar: ${profile.primaryRole.trim()}.` : '',
    profile.skills.length ? `W profilu wskazuję umiejętności: ${profile.skills.slice(0, 5).join(', ')}.` : '',
  ].filter(Boolean)
  const analysisSummary = analysis?.summary.trim() ? sanitizeAnalysisText(analysis.summary.trim()) : ''
  const analysisPart = analysisSummary ? `Aktualny wynik analizy: ${analysisSummary}` : ''
  const body = [...profileParts, analysisPart].filter(Boolean).join('\n\n')
  return `${introductions[tone]} „${offer.title}” w ${offer.company}.${body ? `\n\n${body}` : ''}\n\nChętnie opowiem więcej o swoim dopasowaniu do tej roli.\n\nPozdrawiam,\n[Twoje imię]`
}
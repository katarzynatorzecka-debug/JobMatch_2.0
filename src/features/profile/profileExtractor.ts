import type { CvSource, ProfileFieldConfidence, UserProfileDraft } from '../../contracts/profile'
import { userProfileDraftSchema } from '../../schemas/profileSchemas'
import { defaultProfile } from './profileDefaults'

const skillDictionary = [
  'IT Service Management', 'Service Delivery', 'Stakeholder Management', 'Incident and Problem Management', 'KPI and SLA Governance',
  'Continuous Improvement', 'Team Leadership', 'Risk Management', 'Process Mapping', 'Power BI', 'Power Query', 'Power Automate',
  'ServiceNow', 'Microsoft 365', 'Jira', 'Confluence', 'Make', 'Zapier', 'REST APIs', 'Webhooks', 'SharePoint', 'Dataverse',
  'SQL', 'Python', 'BPMN', 'Requirements Analysis', 'UAT', 'Change Management', 'Microsoft Office', 'Communication',
  'Organisation', 'Teamwork', 'Customer service', 'Excel', 'Google Sheets', 'Looker Studio', 'JavaScript', 'TypeScript',
]

const headingPattern = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:professional\s+summary|summary|profile|podsumowanie(?:\s+zawodowe)?|o mnie)\s*[:\n]/i
const roleLinePattern = /(?:^|\n)\s*(?:#{1,4}\s*|\*\*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ/&\- ]{2,80}(?:manager|specialist|analyst|coordinator|lead|technician|engineer|kierownik|specjalista|analityk|koordynator)[A-Za-zÀ-ÿ/&\- ]{0,45})(?:\*\*)?\s*(?:\||$)/gim
const knownRolePattern = /\b(?:IT\s+Service\s+Delivery\s+Manager|Service\s+Delivery\s+Manager|Process\s+Automation\s+Specialist|Business\s+Process\s+Analyst|Operations\s+Analyst|IT\s+Service\s+Coordinator|Service\s+Coordinator|Team\s+Coordinator|Automation\s+Specialist|Data\s+Analyst|Project\s+Manager)\b/gi

function normalizeText(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function unique(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const normalized = value.trim().toLocaleLowerCase()
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function findRoles(text: string) {
  const roles: string[] = []
  for (const match of text.matchAll(roleLinePattern)) roles.push(match[1].trim().replace(/\s+/g, ' '))
  for (const match of text.matchAll(knownRolePattern)) roles.push(match[0].trim())
  return unique(roles).slice(0, 4)
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function findSkills(text: string) {
  return unique(skillDictionary.filter((skill) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(skill)}(?=$|[^a-z0-9])`, 'i').test(text)))
}

function findSummary(text: string) {
  const section = text.match(headingPattern)
  if (section?.index !== undefined) {
    const after = text.slice(section.index + section[0].length)
    const summary = after.split(/\n\s*(?:#{1,4}\s*)?(?:professional\s+experience|experience|doświadczenie|education|education|skills|core\s+skills|umiejętności)\b/i)[0]
      .split(/\n\s*#{1,4}\s*/)[0].replace(/\n+/g, ' ').trim()
    if (summary.length >= 20) return summary.slice(0, 700)
  }
  const inlineSummary = text.match(/(?:professional\s+summary|summary|podsumowanie(?:\s+zawodowe)?|o mnie)\s*[:\-]?\s*([\s\S]*?)(?=(?:professional\s+experience|experience|doświadczenie|education|core\s+skills|skills|umiejętności)\b|$)/i)
  if (inlineSummary?.[1]) {
    const summary = inlineSummary[1].replace(/\s+/g, ' ').trim()
    if (summary.length >= 20) return summary.slice(0, 700)
  }
  const candidate = text.split('\n').map((line) => line.trim()).find((line) => line.length >= 40 && !/@|\+\d|linkedin/i.test(line))
  return candidate?.slice(0, 700) ?? ''
}

function confidenceFor(value: string | string[], highThreshold = 1): ProfileFieldConfidence {
  const present = Array.isArray(value) ? value.length : value.length > 0 ? 1 : 0
  if (!present) return 'missing'
  return present >= highThreshold ? 'high' : 'medium'
}

export function extractProfileDraft(cvText: string, source: CvSource): UserProfileDraft {
  const text = normalizeText(cvText)
  const wordCount = text.split(/\s+/).filter(Boolean).length
  if (text.length < 100 || wordCount < 20) throw new Error('Tekst CV jest zbyt krótki, aby przygotować draft profilu.')

  const roles = findRoles(text)
  const skills = findSkills(text)
  const summary = findSummary(text)
  const confidence = {
    primaryRole: confidenceFor(roles[0] ?? ''),
    alternativeRoles: confidenceFor(roles.slice(1)),
    experienceSummary: confidenceFor(summary),
    skills: confidenceFor(skills, 4),
  }
  const warnings: string[] = []
  if (!roles[0]) warnings.push('Nie udało się jednoznacznie rozpoznać roli głównej.')
  if (!summary) warnings.push('Nie udało się przygotować podsumowania doświadczenia.')
  if (!skills.length) warnings.push('Nie udało się rozpoznać umiejętności — uzupełnij je ręcznie.')
  if (confidence.primaryRole === 'medium' || confidence.experienceSummary === 'medium' || confidence.skills === 'medium') warnings.push('Część rozpoznanych danych wymaga sprawdzenia.')

  const draft: UserProfileDraft = {
    values: { ...defaultProfile, primaryRole: roles[0] ?? '', alternativeRoles: roles.slice(1), experienceSummary: summary, skills },
    confidence,
    warnings,
    source,
    requiresAcceptance: true,
  }
  const validation = userProfileDraftSchema.safeParse(draft)
  if (!validation.success) throw new Error('Nie udało się przygotować poprawnego draftu profilu.')
  return validation.data
}

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
const roleLinePattern = /(?:^|\n)\s*(?:#{1,4}\s*|\*\*)?([A-Za-zÃƒâ‚¬-ÃƒÂ¿][A-Za-zÃƒâ‚¬-ÃƒÂ¿/&\- ]{2,80}(?:manager|specialist|analyst|coordinator|lead|technician|engineer|kierownik|specjalista|analityk|koordynator)[A-Za-zÃƒâ‚¬-ÃƒÂ¿/&\- ]{0,45})(?:\*\*)?\s*(?:\||$)/gim
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

const fullNamePattern = /^\p{L}[.\p{L}'-]*(?:\s+\p{L}[.\p{L}'-]*){1,3}$/u
const roleWordsPattern = /\b(manager|specialist|analyst|coordinator|lead|technician|engineer|developer|designer|consultant|kierownik|specjalista|analityk|koordynator)\b/i

function findFullName(text: string) {
  const ignored = /^(cv|curriculum vitae|profile|summary|professional summary|professional experience|experience|education|skills|core skills)$/i
  const namePattern = /^(\p{L}[.\p{L}'-]*(?:\s+\p{L}[.\p{L}'-]*){1,3})$/u
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20)
  for (const line of lines) {
    if (line.length >= 3 && line.length <= 80 && !ignored.test(line) && !/@|https?:\/\/|\+\d|\d/.test(line) && !roleWordsPattern.test(line) && namePattern.test(line)) return line
    const knownRoleStart = line.search(knownRolePattern)
    if (knownRoleStart > 0) {
      const prefix = line.slice(0, knownRoleStart).trim()
      if (namePattern.test(prefix)) return prefix
    }
    const roleStart = line.search(/\b(?:manager|specialist|analyst|coordinator|lead|technician|engineer|developer|designer|consultant|kierownik|specjalista|analityk|koordynator)\b/i)
    if (roleStart > 0) {
      const prefix = line.slice(0, roleStart).trim().replace(/[|,:-]+$/, '').trim()
      if (namePattern.test(prefix)) return prefix
    }
  }
  return null
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
    const summary = after.split(/\n\s*(?:#{1,4}\s*)?(?:professional\s+experience|experience|doÃ…â€ºwiadczenie|education|education|skills|core\s+skills|umiejÃ„â„¢tnoÃ…â€ºci)\b/i)[0]
      .split(/\n\s*#{1,4}\s*/)[0].replace(/\n+/g, ' ').trim()
    if (summary.length >= 20) return summary.slice(0, 700)
  }
  const inlineSummary = text.match(/(?:professional\s+summary|summary|podsumowanie(?:\s+zawodowe)?|o mnie)\s*[:\-]?\s*([\s\S]*?)(?=(?:professional\s+experience|experience|doÃ…â€ºwiadczenie|education|core\s+skills|skills|umiejÃ„â„¢tnoÃ…â€ºci)\b|$)/i)
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
  if (text.length < 100 || wordCount < 20) throw new Error('Tekst CV jest zbyt krÃƒÂ³tki, aby przygotowaÃ„â€¡ draft profilu.')

  const fullName = findFullName(text)
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
  if (!roles[0]) warnings.push('Nie udaÃ…â€šo siÃ„â„¢ jednoznacznie rozpoznaÃ„â€¡ roli gÃ…â€šÃƒÂ³wnej.')
  if (!summary) warnings.push('Nie udaÃ…â€šo siÃ„â„¢ przygotowaÃ„â€¡ podsumowania doÃ…â€ºwiadczenia.')
  if (!skills.length) warnings.push('Nie udaÃ…â€šo siÃ„â„¢ rozpoznaÃ„â€¡ umiejÃ„â„¢tnoÃ…â€ºci Ã¢â‚¬â€ uzupeÃ…â€šnij je rÃ„â„¢cznie.')
  if (confidence.primaryRole === 'medium' || confidence.experienceSummary === 'medium' || confidence.skills === 'medium') warnings.push('CzÃ„â„¢Ã…â€ºÃ„â€¡ rozpoznanych danych wymaga sprawdzenia.')

  const draft: UserProfileDraft = {
    values: { ...defaultProfile, primaryRole: roles[0] ?? '', alternativeRoles: roles.slice(1), experienceSummary: summary, skills },
    confidence,
    warnings,
    source,
    requiresAcceptance: true,
    presentation: { fullName, source: fullName ? 'cv' : 'none' },
  }
  const validation = userProfileDraftSchema.safeParse(draft)
  if (!validation.success) throw new Error('Nie udaÃ…â€šo siÃ„â„¢ przygotowaÃ„â€¡ poprawnego draftu profilu.')
  return validation.data
}
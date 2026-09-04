import { analysisCategories } from './jobAnalysisOutputSchema.ts'

type AnalysisCategory = (typeof analysisCategories)[number]

export const OFFER_INTELLIGENCE_CONTRACT_VERSION = 'jobmatch-offer-intelligence-r1'
export const offerIntelligenceTypes = ['required_skill', 'required_experience', 'language', 'responsibility_capability', 'employment_condition', 'preferred_qualification'] as const
export const offerIntelligenceImportance = ['critical', 'core', 'preferred'] as const
export const offerIntelligenceSections = ['description', 'requirements', 'responsibilities', 'benefits', 'metadata'] as const

export type OfferIntelligenceType = (typeof offerIntelligenceTypes)[number]
export type OfferIntelligenceImportance = (typeof offerIntelligenceImportance)[number]
export type OfferIntelligenceSection = (typeof offerIntelligenceSections)[number]

export type OfferSourceSnapshot = {
  sourceQuality: 'full' | 'partial' | 'unavailable'
  text: string
  requirements: string[]
  responsibilities: string[]
  benefits: string[]
  missingInformation: string[]
}

export type OfferIntelligenceCriterion = {
  id: string
  canonicalKey: string
  statement: string
  type: OfferIntelligenceType
  importance: OfferIntelligenceImportance
  category: AnalysisCategory
  sourceEvidence: string[]
  sourceSection: OfferIntelligenceSection | null
  requiredExplicitly: boolean
}

export type OfferIntelligenceProviderOutput = {
  criteria: OfferIntelligenceCriterion[]
  rubricComplete: boolean
  unresolvedAmbiguities: string[]
  missingInformation: string[]
}

export type OfferIntelligenceRubric = {
  contractVersion: typeof OFFER_INTELLIGENCE_CONTRACT_VERSION
  sourceSnapshotHash: string
  quality: {
    sourceCompleteness: 'full' | 'partial' | 'unavailable'
    rubricCompleteness: 'complete' | 'incomplete'
    criterionCount: number
    unresolvedAmbiguityCount: number
    missingInformation: string[]
  }
  criteria: OfferIntelligenceCriterion[]
}

const shortText = { type: 'string', minLength: 1, maxLength: 500 }

const providerCriterionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'canonicalKey', 'statement', 'type', 'importance', 'category', 'sourceEvidence', 'sourceSection', 'requiredExplicitly'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 120 },
    canonicalKey: { type: 'string', minLength: 1, maxLength: 100 },
    statement: shortText,
    type: { type: 'string', enum: [...offerIntelligenceTypes] },
    importance: { type: 'string', enum: [...offerIntelligenceImportance] },
    category: { type: 'string', enum: [...analysisCategories] },
    sourceEvidence: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 400 } },
    sourceSection: { type: ['string', 'null'], enum: [...offerIntelligenceSections, null] },
    requiredExplicitly: { type: 'boolean' },
  },
}

export const offerIntelligenceJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['criteria', 'rubricComplete', 'unresolvedAmbiguities', 'missingInformation'],
  properties: {
    criteria: { type: 'array', minItems: 1, maxItems: 64, items: providerCriterionSchema },
    rubricComplete: { type: 'boolean' },
    unresolvedAmbiguities: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 240 } },
    missingInformation: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
} as const

const compact = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
const normalized = (value: string) => compact(value).toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+#.]+/g, ' ').trim().replace(/\s+/g, ' ')
const keyPart = (value: string) => normalized(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96)
const unique = (values: unknown[], max: number) => {
  const seen = new Set<string>()
  return values.map(compact).filter((value) => {
    const key = normalized(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, max)
}

export function canonicalOfferIntelligenceSource(snapshot: OfferSourceSnapshot) {
  return [snapshot.text, ...snapshot.requirements, ...snapshot.responsibilities, ...snapshot.benefits].map(normalized).filter(Boolean).join(' ')
}

function evidenceIsInSource(evidence: string, source: OfferSourceSnapshot) {
  const haystack = canonicalOfferIntelligenceSource(source)
  return normalized(evidence).length >= 3 && haystack.includes(normalized(evidence))
}

function validProviderCriterion(value: unknown, source: OfferSourceSnapshot) {
  if (!value || typeof value !== 'object') return false
  const criterion = value as Record<string, unknown>
  if (typeof criterion.id !== 'string' || !criterion.id.trim() || criterion.id.length > 120 || typeof criterion.statement !== 'string' || !criterion.statement.trim() || criterion.statement.length > 500) return false
  if (typeof criterion.canonicalKey !== 'string' || !keyPart(criterion.canonicalKey)) return false
  if (!offerIntelligenceTypes.includes(criterion.type as OfferIntelligenceType) || !offerIntelligenceImportance.includes(criterion.importance as OfferIntelligenceImportance)) return false
  if (!analysisCategories.includes(criterion.category as AnalysisCategory)) return false
  if (!Array.isArray(criterion.sourceEvidence) || criterion.sourceEvidence.length < 1 || criterion.sourceEvidence.length > 4 || !criterion.sourceEvidence.every((item) => typeof item === 'string' && item.length <= 400 && evidenceIsInSource(item, source))) return false
  if (criterion.sourceSection !== null && !offerIntelligenceSections.includes(criterion.sourceSection as OfferIntelligenceSection)) return false
  return typeof criterion.requiredExplicitly === 'boolean'
}

export function isOfferIntelligenceProviderOutput(value: unknown, source: OfferSourceSnapshot): value is OfferIntelligenceProviderOutput {
  if (!value || typeof value !== 'object') return false
  const output = value as Record<string, unknown>
  return Array.isArray(output.criteria) && output.criteria.length > 0 && output.criteria.length <= 64
    && output.criteria.every((criterion) => validProviderCriterion(criterion, source))
    && typeof output.rubricComplete === 'boolean'
    && Array.isArray(output.unresolvedAmbiguities) && output.unresolvedAmbiguities.length <= 12 && output.unresolvedAmbiguities.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 240)
    && Array.isArray(output.missingInformation) && output.missingInformation.length <= 12 && output.missingInformation.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 240)
}

export function buildOfferIntelligenceRubric(source: OfferSourceSnapshot, sourceSnapshotHash: string, output: OfferIntelligenceProviderOutput): OfferIntelligenceRubric | null {
  if (!/^[0-9a-f]{64}$/.test(sourceSnapshotHash) || !isOfferIntelligenceProviderOutput(output, source)) return null
  const seen = new Set<string>()
  const criteria: OfferIntelligenceCriterion[] = []
  for (const raw of output.criteria) {
    const sourceKey = keyPart(raw.canonicalKey)
    const canonicalKey = `req:${sourceKey}`.slice(0, 120)
    if (seen.has(canonicalKey)) return null
    seen.add(canonicalKey)
    criteria.push({
      id: canonicalKey,
      canonicalKey,
      statement: compact(raw.statement),
      type: raw.type,
      importance: raw.importance,
      category: raw.category,
      sourceEvidence: unique(raw.sourceEvidence, 4),
      sourceSection: raw.sourceSection,
      requiredExplicitly: raw.requiredExplicitly,
    })
  }
  const unresolvedAmbiguities = unique(output.unresolvedAmbiguities, 12)
  const missingInformation = unique([...source.missingInformation, ...output.missingInformation], 12)
  const complete = output.rubricComplete && unresolvedAmbiguities.length === 0 && criteria.length > 0
  return {
    contractVersion: OFFER_INTELLIGENCE_CONTRACT_VERSION,
    sourceSnapshotHash,
    quality: {
      sourceCompleteness: source.sourceQuality,
      rubricCompleteness: complete ? 'complete' : 'incomplete',
      criterionCount: criteria.length,
      unresolvedAmbiguityCount: unresolvedAmbiguities.length,
      missingInformation,
    },
    criteria,
  }
}

export function isOfferIntelligenceRubric(value: unknown): value is OfferIntelligenceRubric {
  if (!value || typeof value !== 'object') return false
  const rubric = value as Record<string, unknown>
  if (rubric.contractVersion !== OFFER_INTELLIGENCE_CONTRACT_VERSION || typeof rubric.sourceSnapshotHash !== 'string' || !/^[0-9a-f]{64}$/.test(rubric.sourceSnapshotHash) || !rubric.quality || typeof rubric.quality !== 'object' || !Array.isArray(rubric.criteria)) return false
  const quality = rubric.quality as Record<string, unknown>
  const seen = new Set<string>()
  const criteria = rubric.criteria as unknown[]
  const valid = criteria.length > 0 && criteria.length <= 64 && criteria.every((value) => {
    if (!value || typeof value !== 'object') return false
    const criterion = value as Record<string, unknown>
    if (typeof criterion.id !== 'string' || !/^req:[a-z0-9][a-z0-9._-]{0,115}$/.test(criterion.id) || typeof criterion.canonicalKey !== 'string' || criterion.id !== criterion.canonicalKey || seen.has(criterion.canonicalKey)) return false
    seen.add(criterion.canonicalKey)
    return typeof criterion.statement === 'string' && criterion.statement.trim().length > 0 && offerIntelligenceTypes.includes(criterion.type as OfferIntelligenceType) && offerIntelligenceImportance.includes(criterion.importance as OfferIntelligenceImportance) && analysisCategories.includes(criterion.category as AnalysisCategory) && Array.isArray(criterion.sourceEvidence) && criterion.sourceEvidence.length > 0 && criterion.sourceEvidence.every((item) => typeof item === 'string' && item.trim().length > 0) && (criterion.sourceSection === null || offerIntelligenceSections.includes(criterion.sourceSection as OfferIntelligenceSection)) && typeof criterion.requiredExplicitly === 'boolean'
  })
  return valid && quality.sourceCompleteness !== undefined && ['full', 'partial', 'unavailable'].includes(String(quality.sourceCompleteness)) && ['complete', 'incomplete'].includes(String(quality.rubricCompleteness)) && quality.criterionCount === criteria.length && Number.isInteger(quality.unresolvedAmbiguityCount) && Number(quality.unresolvedAmbiguityCount) >= 0 && Array.isArray(quality.missingInformation) && quality.missingInformation.every((item) => typeof item === 'string')
}

export function isOfferIntelligenceRubricSufficient(rubric: OfferIntelligenceRubric) {
  return rubric.quality.sourceCompleteness === 'full' && rubric.quality.rubricCompleteness === 'complete' && rubric.quality.unresolvedAmbiguityCount === 0 && rubric.criteria.length > 0
}

export function buildOfferIntelligencePrompt(source: OfferSourceSnapshot, sourceSnapshotHash: string) {
  return `Zbuduj wyłącznie rubrykę wymagań pracodawcy z pełnego, zamrożonego snapshotu oferty. Nie otrzymujesz profilu kandydata i nie wolno Ci go zakładać. Odczytaj znaczenie semantycznie, niezależnie od nagłówków, list i kolejności portalu. Zwróć atomic criteria: każde realne wymaganie lub capability ma jeden canonicalKey i jeden udział w score. Deduplicate sens: to samo znaczenie opisane jako skill, doświadczenie i obowiązek zwróć tylko raz. Obowiązek może utworzyć responsibility_capability, gdy wynika z niego zdolność wymagana do wykonania pracy. requiredExplicitly=true tylko dla wymagania jawnie wymaganego; capability wyprowadzona z obowiązku może być false. importance wybierz jako critical, core lub preferred na podstawie języka i znaczenia w ofercie. sourceEvidence musi być krótkim, dosłownym fragmentem snapshotu. Jeśli nie da się zbudować kompletnej rubryki, ustaw rubricComplete=false i opisz nierozstrzygnięcia. Nie licz score, coverage ani rekomendacji.
sourceSnapshotHash: ${sourceSnapshotHash}
snapshot: ${JSON.stringify(source)}`
}

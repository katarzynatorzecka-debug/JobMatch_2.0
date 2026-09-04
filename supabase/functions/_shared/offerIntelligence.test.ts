import { describe, expect, it } from 'vitest'
import { buildOfferIntelligencePrompt, buildOfferIntelligenceRubric, isOfferIntelligenceProviderOutput, isOfferIntelligenceRubric, isOfferIntelligenceRubricSufficient, offerIntelligenceJsonSchemaForSource, offerIntelligenceProviderValidationDiagnostic, shouldRefreshOfferSourceSnapshot, type OfferIntelligenceProviderOutput, type OfferSourceSnapshot } from './offerIntelligence'

const sourceHash = 'b'.repeat(64)
const source: OfferSourceSnapshot = {
  sourceQuality: 'full',
  text: 'Community Moderator. You will: Work with social media. Initiate discussions in social media. Wymagane umiejętności: arabski, social media.',
  requirements: ['arabski', 'social media'],
  responsibilities: ['Work with social media', 'Initiate discussions in social media'],
  benefits: [],
  missingInformation: [],
}

function criterion(overrides: Partial<OfferIntelligenceProviderOutput['criteria'][number]> = {}) {
  return {
    id: 'provider-id',
    canonicalKey: 'arabic-language',
    statement: 'Znajomość języka arabskiego',
    type: 'language' as const,
    importance: 'critical' as const,
    category: 'skills' as const,
    sourceEvidence: ['arabski'],
    sourceSection: 'requirements' as const,
    requiredExplicitly: true,
    ...overrides,
  }
}

describe('offer intelligence truth layer', () => {
  it('refreshes a stored full snapshot when its contract is legacy', () => {
    expect(shouldRefreshOfferSourceSnapshot({ hasStoredSource: true, storedContractVersion: 'jobmatch-analysis-contract-r7', activeContractVersion: 'jobmatch-analysis-contract-vnext-b' })).toBe(true)
    expect(shouldRefreshOfferSourceSnapshot({ hasStoredSource: true, storedContractVersion: 'jobmatch-analysis-contract-vnext-b', activeContractVersion: 'jobmatch-analysis-contract-vnext-b' })).toBe(false)
  })

  it('reports grounded-evidence failures without exposing source text', () => {
    expect(offerIntelligenceProviderValidationDiagnostic({ criteria: [criterion({ sourceEvidence: ['not in source'] })], rubricComplete: true, unresolvedAmbiguities: [], missingInformation: [] }, source)).toBe('criterion_0_evidence_not_grounded')
  })

  it('captures the Community Moderator shape as atomic employer criteria', () => {
    const output: OfferIntelligenceProviderOutput = {
      criteria: [
        criterion(),
        criterion({ id: 'provider-social', canonicalKey: 'social-media', statement: 'Praca z social media', type: 'required_skill', sourceEvidence: ['social media'] }),
        criterion({ id: 'provider-moderation', canonicalKey: 'social-media-work', statement: 'Zdolność do pracy z social media', type: 'responsibility_capability', importance: 'core', sourceEvidence: ['Work with social media'], sourceSection: 'responsibilities', requiredExplicitly: false }),
        criterion({ id: 'provider-discussions', canonicalKey: 'social-media-discussions', statement: 'Zdolność do inicjowania dyskusji w social media', type: 'responsibility_capability', importance: 'core', sourceEvidence: ['Initiate discussions in social media'], sourceSection: 'responsibilities', requiredExplicitly: false }),
      ],
      rubricComplete: true,
      unresolvedAmbiguities: [],
      missingInformation: [],
    }
    const rubric = buildOfferIntelligenceRubric(source, sourceHash, output)
    expect(rubric).not.toBeNull()
    expect(rubric?.criteria).toHaveLength(4)
    expect(rubric?.criteria.map((item) => item.canonicalKey)).toEqual(['req:arabic-language', 'req:social-media', 'req:social-media-work', 'req:social-media-discussions'])
    expect(rubric?.criteria.find((item) => item.canonicalKey === 'req:arabic-language')?.importance).toBe('critical')
    expect(rubric?.criteria.find((item) => item.canonicalKey === 'req:social-media-work')?.type).toBe('responsibility_capability')
    expect(rubric && isOfferIntelligenceRubric(rubric)).toBe(true)
    expect(rubric && isOfferIntelligenceRubricSufficient(rubric)).toBe(true)
  })

  it('does not depend on a known heading for a custom mission section', () => {
    const customSource = { ...source, text: 'Your mission: Own community engagement and moderate online conversations.', requirements: [], responsibilities: [], benefits: [] }
    const output: OfferIntelligenceProviderOutput = {
      criteria: [criterion({ canonicalKey: 'community-engagement', statement: 'Prowadzenie działań community engagement', type: 'responsibility_capability', sourceEvidence: ['Own community engagement'], sourceSection: 'description', requiredExplicitly: false })],
      rubricComplete: true,
      unresolvedAmbiguities: [],
      missingInformation: [],
    }
    expect(buildOfferIntelligenceRubric(customSource, sourceHash, output)?.criteria[0].sourceEvidence).toEqual(['Own community engagement'])
  })

  it('maps explicit requirements from continuous text without list or heading heuristics', () => {
    const continuousSource = { ...source, text: 'The role requires Arabic and social media moderation experience. You will initiate discussions in social media while supporting the community.', requirements: [], responsibilities: [], benefits: [] }
    const output: OfferIntelligenceProviderOutput = {
      criteria: [
        criterion({ canonicalKey: 'arabic-language', sourceEvidence: ['Arabic'] }),
        criterion({ canonicalKey: 'social-media-moderation-experience', statement: 'Doświadczenie w moderacji social media', type: 'required_experience', category: 'experience', sourceEvidence: ['social media moderation experience'], sourceSection: 'description' }),
        criterion({ canonicalKey: 'initiate-social-discussions', statement: 'Zdolność do inicjowania dyskusji w social media', type: 'responsibility_capability', importance: 'core', sourceEvidence: ['initiate discussions in social media'], sourceSection: 'description', requiredExplicitly: false }),
      ],
      rubricComplete: true,
      unresolvedAmbiguities: [],
      missingInformation: [],
    }
    const rubric = buildOfferIntelligenceRubric(continuousSource, sourceHash, output)
    expect(rubric?.criteria).toHaveLength(3)
    expect(rubric?.quality.sourceCompleteness).toBe('full')
  })

  it('rejects fabricated evidence and duplicate semantic keys instead of guessing', () => {
    const fabricated: OfferIntelligenceProviderOutput = { criteria: [criterion({ sourceEvidence: ['Python'] })], rubricComplete: true, unresolvedAmbiguities: [], missingInformation: [] }
    expect(isOfferIntelligenceProviderOutput(fabricated, source)).toBe(false)
    const duplicate: OfferIntelligenceProviderOutput = { criteria: [criterion(), criterion({ id: 'provider-duplicate', canonicalKey: 'arabic language' })], rubricComplete: true, unresolvedAmbiguities: [], missingInformation: [] }
    expect(buildOfferIntelligenceRubric(source, sourceHash, duplicate)).toBeNull()
  })

  it('fails closed for incomplete source or unresolved rubric ambiguity', () => {
    const incompleteSource = { ...source, sourceQuality: 'partial' as const }
    const output: OfferIntelligenceProviderOutput = { criteria: [criterion()], rubricComplete: false, unresolvedAmbiguities: ['Nie wiadomo, czy język jest wymagany.'], missingInformation: [] }
    const rubric = buildOfferIntelligenceRubric(incompleteSource, sourceHash, output)
    expect(rubric?.quality.rubricCompleteness).toBe('incomplete')
    expect(rubric && isOfferIntelligenceRubricSufficient(rubric)).toBe(false)
  })

  it('builds a profile-independent prompt from the complete bounded snapshot', () => {
    const prompt = buildOfferIntelligencePrompt(source, sourceHash)
    expect(prompt).toContain('You will:')
    expect(prompt).toContain('arabski')
    expect(prompt).toContain(sourceHash)
    expect(prompt).not.toContain('Kandydat: Jan Kowalski')
  })

  it('binds source evidence to exact snapshot lines and sentences', () => {
    const schema = offerIntelligenceJsonSchemaForSource(source) as { properties: { criteria: { items: { properties: { sourceEvidence: { items: { enum: string[] } } } } } } }
    expect(schema.properties.criteria.items.properties.sourceEvidence.items.enum).toContain('arabski')
    expect(schema.properties.criteria.items.properties.sourceEvidence.items.enum).toContain('Work with social media')
    expect(schema.properties.criteria.items.properties.sourceEvidence.items.enum).not.toContain('Python')
    expect(schema.properties.criteria.items.properties.sourceEvidence.items.enum.length).toBeLessThanOrEqual(128)
  })
})

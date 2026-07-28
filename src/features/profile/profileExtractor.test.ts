import { describe, expect, it } from 'vitest'
import { extractProfileDraft } from './profileExtractor'

const automationText = `Process Automation Specialist\n\nProfessional Summary\nProcess Automation Specialist building reliable workflows for business teams, with experience in process mapping, requirements analysis and measurable improvement.\n\nProfessional Experience\nProcess Automation Specialist | Example Studio\nCreated workflow automations and reports.\n\nCore Skills\nPower Automate, Make, REST APIs, Power BI, SQL, Process Mapping, UAT`
const incompleteText = `Service Coordinator\n\nProfessional Summary\nCoordinator supporting service teams and following up actions for customers. Organised, communicative and focused on day-to-day service support.\n\nProfessional Experience\nHelped teams with routine service issues and meetings.\n\nCore Skills\nMicrosoft Office, Communication`

describe('ProfileExtractor', () => {
  it('derives role, summary and skills from text without preferences', () => {
    const draft = extractProfileDraft(automationText, 'pasted-text')
    expect(draft.values.primaryRole).toContain('Process Automation Specialist')
    expect(draft.values.experienceSummary.length).toBeGreaterThan(20)
    expect(draft.values.skills.length).toBeGreaterThan(2)
    expect(draft.values.acceptedWorkModes).toEqual([])
    expect(draft.values.acceptedContractTypes).toEqual([])
    expect(draft.values.acceptedLocations).toEqual([])
  })
  it('marks incomplete text as needing review instead of inventing data', () => {
    const draft = extractProfileDraft(incompleteText, 'pasted-text')
    expect(draft.confidence.skills).toBe('medium')
    expect(draft.values.minimumSalary).toBeNull()
    expect(draft.values.excludedKeywords).toEqual([])
  })
  it('rejects empty and too short CV text', () => {
    expect(() => extractProfileDraft('', 'pasted-text')).toThrow()
    expect(() => extractProfileDraft('Krótki opis bez wystarczającej treści.', 'pasted-text')).toThrow()
  })
  it('uses the same extractor for PDF text and pasted fallback, without storage side effects', () => {
    const fromPdf = extractProfileDraft(automationText, 'pdf')
    const fromPaste = extractProfileDraft(automationText, 'pasted-text')
    expect(fromPdf.values).toEqual(fromPaste.values)
    expect(fromPdf.source).toBe('pdf')
    expect(fromPaste.source).toBe('pasted-text')
  })
  it('preserves manual corrections when the final profile is validated', () => {
    const draft = extractProfileDraft(automationText, 'pasted-text')
    const corrected = { ...draft.values, primaryRole: 'Manually corrected role', skills: [...draft.values.skills, 'Manual skill'] }
    expect(corrected.primaryRole).toBe('Manually corrected role')
    expect(corrected.skills).toContain('Manual skill')
  })
})

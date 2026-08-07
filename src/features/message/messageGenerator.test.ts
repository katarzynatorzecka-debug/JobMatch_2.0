import { describe, expect, it } from 'vitest'
import { createMessage } from './messageGenerator'

const offer = { id: 'offer-1', title: 'Automation Specialist', company: 'Acme', sourceType: 'rocketjobs-eml' } as never
const profile = { primaryRole: 'Operations Manager', skills: ['SQL', 'Automatyzacja'], alternativeRoles: [], experienceSummary: '', acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'] } as never

describe('canonical message generator', () => {
  it('uses only canonical offer and profile facts, with optional current analysis', () => {
    const message = createMessage('Naturalny', offer, profile, { recommendation: 'Warto aplikować', summary: 'Profil pasuje do zakresu roli.' } as never)
    expect(message).toContain('Automation Specialist')
    expect(message).toContain('Acme')
    expect(message).toContain('Operations Manager')
    expect(message).toContain('SQL, Automatyzacja')
    expect(message).toContain('Profil pasuje do zakresu roli.')
    expect(message).not.toContain('dane, automatyzacją i uporządkowanymi procesami')
  })


  it('sanitizes raw criterion outcomes at the generator input boundary', () => {
    const message = createMessage('Naturalny', offer, profile, {
      summary: 'MATCH PARTIAL NO_MATCH UNKNOWN',
    } as never)
    for (const raw of ['MATCH', 'PARTIAL', 'NO_MATCH', 'UNKNOWN']) expect(message).not.toContain(raw)
    expect(message).toContain('Spełnione')
    expect(message).toContain('Częściowo spełnione')
    expect(message).toContain('Niespełnione')
    expect(message).toContain('Brak wystarczających danych')
  })
  it('works without analysis and does not invent unsupported facts', () => {
    const message = createMessage('Formalny', offer, profile, null)
    expect(message).toContain('Automation Specialist')
    expect(message).not.toContain('lat doświadczenia')
    expect(message).not.toContain('certyfikat')
  })
})
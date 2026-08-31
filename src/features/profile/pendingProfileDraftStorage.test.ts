import { describe, expect, it } from 'vitest'
import type { UserProfileDraft } from '../../contracts/profile'
import { clearPendingProfileDraft, loadPendingProfileDraft, pendingProfileDraftKey, savePendingProfileDraft } from './pendingProfileDraftStorage'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }
}

const draft: UserProfileDraft = {
  values: { primaryRole: 'Service Specialist', alternativeRoles: [], experienceSummary: 'Koordynuję usługi i usprawniam codzienną współpracę zespołów.', skills: ['Jira'], acceptedWorkModes: [], acceptedContractTypes: [], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'] },
  confidence: { primaryRole: 'high', alternativeRoles: 'missing', experienceSummary: 'high', skills: 'high' },
  warnings: [], source: 'pdf', requiresAcceptance: true, presentation: { fullName: 'Anna Example', source: 'cv' },
}

describe('pendingProfileDraftStorage', () => {
  it('restores a valid review draft without provenance or raw CV text', () => {
    const storage = memoryStorage()
    expect(savePendingProfileDraft({ ...draft, provenance: { fullName: { value: 'Anna Example', evidence: ['fragment'], confidence: .9, status: 'extracted' }, primaryRole: { value: 'Service Specialist', evidence: ['fragment'], confidence: .9, status: 'extracted' }, alternativeRoles: { value: [], evidence: [], confidence: 0, status: 'unknown' }, experienceSummary: { value: draft.values.experienceSummary, evidence: ['fragment'], confidence: .9, status: 'extracted' }, skills: { value: ['Jira'], evidence: ['fragment'], confidence: .9, status: 'extracted' }, locations: { value: [], evidence: [], confidence: 0, status: 'unknown' }, workModes: { value: [], evidence: [], confidence: 0, status: 'unknown' }, contractTypes: { value: [], evidence: [], confidence: 0, status: 'unknown' } } }, 'user-a', storage)).toBe(true)
    const restored = loadPendingProfileDraft('user-a', storage)
    expect(restored.draft?.values.primaryRole).toBe('Service Specialist')
    expect(restored.draft?.provenance).toBeUndefined()
    expect(storage.getItem(pendingProfileDraftKey('user-a'))).not.toContain('raw CV')
  })

  it('keeps drafts isolated by authenticated user scope', () => {
    const storage = memoryStorage()
    savePendingProfileDraft(draft, 'user-a', storage)
    expect(loadPendingProfileDraft('user-b', storage).draft).toBeNull()
  })

  it('drops malformed session data safely', () => {
    const storage = memoryStorage({ [pendingProfileDraftKey('user-a')]: '{broken' })
    expect(loadPendingProfileDraft('user-a', storage).draft).toBeNull()
    expect(storage.getItem(pendingProfileDraftKey('user-a'))).toBeNull()
  })

  it('clears the draft after an explicit discard', () => {
    const storage = memoryStorage()
    savePendingProfileDraft(draft, 'user-a', storage)
    clearPendingProfileDraft('user-a', storage)
    expect(loadPendingProfileDraft('user-a', storage).draft).toBeNull()
  })
})

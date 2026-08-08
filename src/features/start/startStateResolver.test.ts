import { describe, expect, it } from 'vitest'
import type { UserProfile } from '../../contracts/profile'
import { localProfileRepository } from '../supabase/repositories'
import { profileSourceForStart, resolveStartState } from './startStateResolver'

const source = (data: UserProfile | null) => ({ load: async () => ({ data }) })

describe('Start state resolver', () => {
  it('routes a missing durable profile to onboarding', async () => {
    await expect(resolveStartState(source(null))).resolves.toBe('onboarding')
  })

  it('routes a saved profile to dashboard without requiring offers', async () => {
    await expect(resolveStartState(source({ primaryRole: 'Operations Manager' } as UserProfile))).resolves.toBe('dashboard')
  })

  it('uses the local profile repository for demo mode', () => {
    expect(profileSourceForStart('demo')).toBe(localProfileRepository)
  })

  it('requires a session for authenticated mode', () => {
    expect(() => profileSourceForStart('authenticated')).toThrow('Brak aktywnej sesji')
  })

  it('is deterministic for refresh and new-tab reads of the same source', async () => {
    const persistedSource = source({ primaryRole: 'Saved role' } as UserProfile)
    await expect(resolveStartState(persistedSource)).resolves.toBe('dashboard')
    await expect(resolveStartState(persistedSource)).resolves.toBe('dashboard')
  })
})
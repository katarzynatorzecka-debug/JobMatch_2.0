import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../contracts/profile'
import type { AppMode } from '../access/AppModeProvider'
import { localProfileRepository, supabaseProfileRepository, type ProfileRepository } from '../supabase/repositories'

export type StartState = 'onboarding' | 'dashboard'

export function profileSourceForStart(mode: AppMode, user?: User | null): ProfileRepository {
  if (mode === 'authenticated') {
    if (!user) throw new Error('Brak aktywnej sesji użytkownika.')
    return supabaseProfileRepository(user)
  }
  return localProfileRepository
}

export type StartProfileSource = { load(): Promise<{ data: UserProfile | null }> }

export async function resolveStartState(profileSource: StartProfileSource): Promise<StartState> {
  const result = await profileSource.load()
  return result.data ? 'dashboard' : 'onboarding'
}
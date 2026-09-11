import type { User } from '@supabase/supabase-js'
import type { AppMode } from '../access/AppModeProvider'
import { localWorkspaceRepository } from './localWorkspaceRepository'
import { supabaseWorkspaceRepository } from './supabaseWorkspaceRepository'
import type { WorkspaceRepository } from './workspaceRepository'

export function workspaceRepositoryFor(mode: AppMode, user?: User | null): WorkspaceRepository {
  if (mode === 'demo') return localWorkspaceRepository()
  if (!user) throw new Error('Brak aktywnej sesji użytkownika.')
  return supabaseWorkspaceRepository(user)
}

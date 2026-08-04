import type { WorkspaceImportResult } from './workspaceRepository'
import { workspaceImportResultSchema } from '../../schemas/workspaceSchemas'

export class WorkspaceRepositoryError extends Error {
  constructor(readonly code: 'WORKSPACE_RPC_INVALID_RESPONSE' | 'WORKSPACE_IMPORT_FAILED' | 'WORKSPACE_IMPORT_NOT_FOUND', message: string) {
    super(message)
    this.name = 'WorkspaceRepositoryError'
  }
}

export function parseWorkspaceImportResult(input: unknown): WorkspaceImportResult {
  const result = workspaceImportResultSchema.safeParse(input)
  if (!result.success) throw new WorkspaceRepositoryError('WORKSPACE_RPC_INVALID_RESPONSE', 'Usługa workspace zwróciła nieprawidłowy wynik importu.')
  return result.data
}

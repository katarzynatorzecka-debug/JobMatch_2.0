import type { WorkspaceImportResult } from './workspaceRepository'
import { workspaceImportResultSchema } from '../../schemas/workspaceSchemas'
import { hardFilterBatchResultSchema } from '../../schemas/workspaceSchemas'
import type { HardFilterBatchResult } from './workspaceRepository'

export class WorkspaceRepositoryError extends Error {
  constructor(readonly code: 'WORKSPACE_RPC_INVALID_RESPONSE' | 'WORKSPACE_INVALID_RESPONSE' | 'WORKSPACE_IMPORT_FAILED' | 'WORKSPACE_IMPORT_NOT_FOUND', message: string) {
    super(message)
    this.name = 'WorkspaceRepositoryError'
  }
}

export function parseWorkspaceImportResult(input: unknown): WorkspaceImportResult {
  const result = workspaceImportResultSchema.safeParse(input)
  if (!result.success) throw new WorkspaceRepositoryError('WORKSPACE_RPC_INVALID_RESPONSE', 'Usługa workspace zwróciła nieprawidłowy wynik importu.')
  return result.data
}

export function parseHardFilterBatchResult(input: unknown): HardFilterBatchResult {
  const result = hardFilterBatchResultSchema.safeParse(input)
  if (!result.success) throw new WorkspaceRepositoryError('WORKSPACE_RPC_INVALID_RESPONSE', 'Usługa workspace zwróciła nieprawidłowy wynik Hard Filter.')
  return result.data
}

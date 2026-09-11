import { describe, expect, it } from 'vitest'
import { parseWorkspaceImportResult, WorkspaceRepositoryError } from './workspaceRpc'

const valid = {
  importSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  foundCount: 2,
  newCount: 1,
  duplicateCount: 1,
  invalidCount: 0,
  needsReviewCount: 0,
  status: 'active',
  createdOfferIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
  reusedOfferIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
  possibleDuplicateOfferIds: [],
  invalidItems: [],
  idempotent: false,
}

describe('workspace import RPC boundary', () => {
  it('accepts a complete active or partial import result', () => {
    expect(parseWorkspaceImportResult(valid)).toEqual(valid)
    expect(parseWorkspaceImportResult({ ...valid, status: 'partial' }).status).toBe('partial')
  })

  it('rejects an unknown status and malformed arrays with a domain error', () => {
    expect(() => parseWorkspaceImportResult({ ...valid, status: 'reverted' })).toThrow(WorkspaceRepositoryError)
    expect(() => parseWorkspaceImportResult({ ...valid, createdOfferIds: 'not-an-array' })).toThrow('nieprawidłowy wynik importu')
  })
})

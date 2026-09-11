import { describe, expect, it } from 'vitest'
import { createMessageRef, resolveMessageRef } from './messageRef'

const key = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const keyRing = { activeVersion: 1, keys: { 1: key } }

describe('Gmail opaque message references', () => {
  it('round-trips only for the same user and connection without exposing the Gmail id', async () => {
    const reference = await createMessageRef('gmail-message-123', 'user-1', 'connection-1', keyRing)
    expect(reference).not.toContain('gmail-message-123')
    await expect(resolveMessageRef(reference, 'user-1', 'connection-1', keyRing)).resolves.toBe('gmail-message-123')
    await expect(resolveMessageRef(reference, 'user-2', 'connection-1', keyRing)).rejects.toThrow('GMAIL_MESSAGE_INVALID')
    await expect(resolveMessageRef(reference, 'user-1', 'connection-2', keyRing)).rejects.toThrow('GMAIL_MESSAGE_INVALID')
  })

  it('rejects malformed and manipulated references', async () => {
    const reference = await createMessageRef('gmail-message-123', 'user-1', 'connection-1', keyRing)
    await expect(resolveMessageRef('not-a-reference', 'user-1', 'connection-1', keyRing)).rejects.toThrow('GMAIL_MESSAGE_INVALID')
    await expect(resolveMessageRef(`${reference.slice(0, -1)}A`, 'user-1', 'connection-1', keyRing)).rejects.toThrow('GMAIL_MESSAGE_INVALID')
  })
})

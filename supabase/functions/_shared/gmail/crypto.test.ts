import { describe, expect, it } from 'vitest'
import { decryptSecret, decryptWithKeyRing, encryptSecret, encryptWithKeyRing, hmacSha256Hex, randomUrlSafe } from './crypto'

const key = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)))
const otherKey = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => 255 - index)))

describe('Gmail secret cryptography', () => {
  it('round-trips an AES-GCM secret with bound AAD', async () => {
    const encrypted = await encryptSecret('refresh-token', key, 1, ['user-1', 'connection-1', 'gmail-token-v1'])
    expect(encrypted.keyVersion).toBe(1)
    expect(atob(encrypted.nonce)).toHaveLength(12)
    await expect(decryptSecret(encrypted, key, ['user-1', 'connection-1', 'gmail-token-v1'])).resolves.toBe('refresh-token')
  })

  it('rejects a different owner, key, or manipulated ciphertext', async () => {
    const encrypted = await encryptSecret('refresh-token', key, 1, ['user-1', 'connection-1'])
    await expect(decryptSecret(encrypted, key, ['user-2', 'connection-1'])).rejects.toThrow('GMAIL_CRYPTO_AUTH_FAILED')
    await expect(decryptSecret(encrypted, otherKey, ['user-1', 'connection-1'])).rejects.toThrow('GMAIL_CRYPTO_AUTH_FAILED')
    const bytes = Uint8Array.from(atob(encrypted.ciphertext), (character) => character.charCodeAt(0))
    bytes[0] ^= 1
    const altered = { ...encrypted, ciphertext: btoa(String.fromCharCode(...bytes)) }
    await expect(decryptSecret(altered, key, ['user-1', 'connection-1'])).rejects.toThrow('GMAIL_CRYPTO_AUTH_FAILED')
  })

  it('creates deterministic HMAC identifiers without exposing the source value', async () => {
    const first = await hmacSha256Hex('gmail-message-id', key)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(await hmacSha256Hex('gmail-message-id', key)).toBe(first)
    expect(await hmacSha256Hex('another-message-id', key)).not.toBe(first)
    expect(first).not.toContain('gmail-message-id')
  })

  it('requires 32-byte keys and at least 32 bytes of randomness', async () => {
    await expect(encryptSecret('token', btoa('short'), 1, ['owner'])).rejects.toThrow('GMAIL_CRYPTO_KEY_INVALID')
    expect(() => randomUrlSafe(16)).toThrow('GMAIL_RANDOM_LENGTH_INVALID')
  })

  it('decrypts a previous key version while encrypting with the active version', async () => {
    const previous = await encryptSecret('old-token', key, 1, ['owner'])
    const keyRing = { activeVersion: 2, keys: { 1: key, 2: otherKey } }
    await expect(decryptWithKeyRing(previous, keyRing, ['owner'])).resolves.toBe('old-token')
    const current = await encryptWithKeyRing('new-token', keyRing, ['owner'])
    expect(current.keyVersion).toBe(2)
    await expect(decryptWithKeyRing(current, keyRing, ['owner'])).resolves.toBe('new-token')
  })
})

import { decryptWithKeyRing, encryptWithKeyRing, type SecretKeyRing } from './crypto.ts'
import { GmailEdgeError } from './errors.ts'

type SerializedReference = { v: 1; c: string; n: string; k: number }

function encode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function decode(value: string) {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='))
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
}

export async function createMessageRef(messageId: string, userId: string, connectionId: string, keyRing: SecretKeyRing) {
  const encrypted = await encryptWithKeyRing(messageId, keyRing, [userId, connectionId, 'gmail-message-ref-v1'])
  return encode(JSON.stringify({ v: 1, c: encrypted.ciphertext, n: encrypted.nonce, k: encrypted.keyVersion } satisfies SerializedReference))
}

export async function resolveMessageRef(reference: string, userId: string, connectionId: string, keyRing: SecretKeyRing) {
  try {
    const parsed = JSON.parse(decode(reference)) as Partial<SerializedReference>
    if (parsed.v !== 1 || typeof parsed.c !== 'string' || typeof parsed.n !== 'string' || !Number.isInteger(parsed.k)) throw new Error()
    return await decryptWithKeyRing({ ciphertext: parsed.c, nonce: parsed.n, keyVersion: parsed.k as number }, keyRing, [userId, connectionId, 'gmail-message-ref-v1'])
  } catch {
    throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 400)
  }
}

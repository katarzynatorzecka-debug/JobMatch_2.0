export type EncryptedSecret = {
  ciphertext: string
  nonce: string
  keyVersion: number
}

export type SecretKeyRing = {
  activeVersion: number
  keys: Readonly<Record<number, string>>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new Error('GMAIL_CRYPTO_VALUE_INVALID')
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function base64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function aad(parts: readonly string[]) {
  if (!parts.length || parts.some((part) => !part.trim())) throw new Error('GMAIL_CRYPTO_AAD_INVALID')
  return encoder.encode(parts.join('\u001f'))
}

async function aesKey(encodedKey: string, usages: KeyUsage[]) {
  const bytes = base64ToBytes(encodedKey)
  if (bytes.byteLength !== 32) throw new Error('GMAIL_CRYPTO_KEY_INVALID')
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, usages)
}

async function hmacKey(encodedKey: string) {
  const bytes = base64ToBytes(encodedKey)
  if (bytes.byteLength !== 32) throw new Error('GMAIL_CRYPTO_KEY_INVALID')
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

export async function encryptSecret(plaintext: string, encodedKey: string, keyVersion: number, aadParts: readonly string[]): Promise<EncryptedSecret> {
  if (!plaintext || !Number.isInteger(keyVersion) || keyVersion < 1) throw new Error('GMAIL_CRYPTO_INPUT_INVALID')
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await aesKey(encodedKey, ['encrypt'])
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(aadParts), tagLength: 128 }, key, encoder.encode(plaintext))
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), nonce: bytesToBase64(nonce), keyVersion }
}

export async function decryptSecret(encrypted: EncryptedSecret, encodedKey: string, aadParts: readonly string[]) {
  const nonce = base64ToBytes(encrypted.nonce)
  if (nonce.byteLength !== 12) throw new Error('GMAIL_CRYPTO_NONCE_INVALID')
  const key = await aesKey(encodedKey, ['decrypt'])
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(aadParts), tagLength: 128 }, key, base64ToBytes(encrypted.ciphertext))
    return decoder.decode(plaintext)
  } catch {
    throw new Error('GMAIL_CRYPTO_AUTH_FAILED')
  }
}

function keyForVersion(keyRing: SecretKeyRing, version: number) {
  if (!Number.isInteger(keyRing.activeVersion) || keyRing.activeVersion < 1) throw new Error('GMAIL_CRYPTO_KEY_VERSION_INVALID')
  const key = keyRing.keys[version]
  if (!key) throw new Error('GMAIL_CRYPTO_KEY_VERSION_UNKNOWN')
  return key
}

export function encryptWithKeyRing(plaintext: string, keyRing: SecretKeyRing, aadParts: readonly string[]) {
  return encryptSecret(plaintext, keyForVersion(keyRing, keyRing.activeVersion), keyRing.activeVersion, aadParts)
}

export function decryptWithKeyRing(encrypted: EncryptedSecret, keyRing: SecretKeyRing, aadParts: readonly string[]) {
  return decryptSecret(encrypted, keyForVersion(keyRing, encrypted.keyVersion), aadParts)
}

export async function hmacSha256Hex(value: string, encodedKey: string) {
  if (!value) throw new Error('GMAIL_CRYPTO_INPUT_INVALID')
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(encodedKey), encoder.encode(value))
  return hex(new Uint8Array(signature))
}

export async function sha256Hex(value: string) {
  if (!value) throw new Error('GMAIL_CRYPTO_INPUT_INVALID')
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

export async function sha256Base64Url(value: string) {
  if (!value) throw new Error('GMAIL_CRYPTO_INPUT_INVALID')
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

export function randomUrlSafe(byteLength = 32) {
  if (!Number.isInteger(byteLength) || byteLength < 32) throw new Error('GMAIL_RANDOM_LENGTH_INVALID')
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

import { describe, expect, it } from 'vitest'
import { GmailImportError } from './gmailContracts'
import { decodeGmailRaw } from './gmailRaw'

function encode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

describe('Gmail format=raw decoder', () => {
  it('decodes unpadded base64url into RFC822 bytes', () => {
    const decoded = decodeGmailRaw(encode('Subject: Test\r\n\r\nBody'))
    expect(new TextDecoder().decode(decoded)).toBe('Subject: Test\r\n\r\nBody')
  })

  it('fails closed for malformed and oversized payloads', () => {
    expect(() => decodeGmailRaw('%%%')).toThrowError(GmailImportError)
    expect(() => decodeGmailRaw(encode('123456'), 3)).toThrowError('GMAIL_MESSAGE_TOO_LARGE')
  })
})

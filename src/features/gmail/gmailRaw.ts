import { GMAIL_MAX_MESSAGE_BYTES, GmailImportError } from './gmailContracts'

function estimatedDecodedBytes(raw: string) {
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0
  return Math.floor((raw.length * 3) / 4) - padding
}

export function decodeGmailRaw(raw: string, maxBytes = GMAIL_MAX_MESSAGE_BYTES): ArrayBuffer {
  const compact = raw.trim()
  if (!compact || !/^[A-Za-z0-9_-]+={0,2}$/.test(compact)) throw new GmailImportError('GMAIL_MESSAGE_INVALID')
  if (estimatedDecodedBytes(compact) > maxBytes) throw new GmailImportError('GMAIL_MESSAGE_TOO_LARGE')
  const standard = compact.replaceAll('-', '+').replaceAll('_', '/')
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    if (binary.length > maxBytes) throw new GmailImportError('GMAIL_MESSAGE_TOO_LARGE')
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes.buffer
  } catch (cause) {
    if (cause instanceof GmailImportError) throw cause
    throw new GmailImportError('GMAIL_MESSAGE_INVALID')
  }
}

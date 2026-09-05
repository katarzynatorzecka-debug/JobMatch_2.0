import type { GmailEdgeErrorCode } from './contracts.ts'

export class GmailEdgeError extends Error {
  constructor(
    public readonly code: GmailEdgeErrorCode,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(code)
    this.name = 'GmailEdgeError'
  }
}

export function edgeError(error: unknown) {
  return error instanceof GmailEdgeError ? error : new GmailEdgeError('GMAIL_PROVIDER_UNAVAILABLE', 502)
}

export function errorResponse(error: unknown, headers: HeadersInit = {}) {
  const resolved = edgeError(error)
  return new Response(JSON.stringify({ code: resolved.code, ...(resolved.retryAfter === undefined ? {} : { retryAfter: resolved.retryAfter }) }), {
    status: resolved.status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export function jsonResponse(body: unknown, headers: HeadersInit = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}

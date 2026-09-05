import { GmailEdgeError } from './errors.ts'

const allowedHeaders = 'authorization, x-client-info, apikey, content-type'

export function parseAllowedOrigins(value: string) {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (!origins.length || origins.some((origin) => origin === '*' || new URL(origin).origin !== origin)) {
    throw new Error('GMAIL_ALLOWED_ORIGINS_INVALID')
  }
  return new Set(origins)
}

export function gmailCorsHeaders(request: Request, allowedOrigins: ReadonlySet<string>) {
  const origin = request.headers.get('Origin')
  if (origin && !allowedOrigins.has(origin)) throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 403)
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

import { describe, expect, it } from 'vitest'
import { gmailCorsHeaders, parseAllowedOrigins } from './cors'

describe('Gmail CORS', () => {
  const origins = parseAllowedOrigins('http://localhost:5173,https://staging.example.com')

  it('echoes only an exact allowlisted origin and never emits a wildcard', () => {
    const headers = gmailCorsHeaders(new Request('https://edge.example.test', { headers: { Origin: 'http://localhost:5173' } }), origins)
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(JSON.stringify(headers)).not.toContain('*')
  })

  it('rejects unknown origins and invalid allowlists', () => {
    expect(() => gmailCorsHeaders(new Request('https://edge.example.test', { headers: { Origin: 'https://attacker.example' } }), origins)).toThrow('GMAIL_PERMISSION_DENIED')
    expect(() => parseAllowedOrigins('*')).toThrow('GMAIL_ALLOWED_ORIGINS_INVALID')
  })
})

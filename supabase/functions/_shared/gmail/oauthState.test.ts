import { describe, expect, it } from 'vitest'
import { createOAuthState, GMAIL_OAUTH_STATE_TTL_MS, isGmailReturnTarget, oauthStateIsUsable } from './oauthState'

describe('Gmail OAuth state', () => {
  it('creates high-entropy state, PKCE S256 and a ten-minute expiry', async () => {
    const now = new Date('2026-09-05T12:00:00.000Z')
    const value = await createOAuthState('local', now)
    expect(value.state.length).toBeGreaterThanOrEqual(43)
    expect(value.stateHash).toMatch(/^[0-9a-f]{64}$/)
    expect(value.pkceVerifier.length).toBeGreaterThanOrEqual(43)
    expect(value.pkceChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(value.expiresAt).toBe(new Date(now.getTime() + GMAIL_OAUTH_STATE_TTL_MS).toISOString())
  })

  it('accepts only fixed return targets', () => {
    expect(isGmailReturnTarget('local')).toBe(true)
    expect(isGmailReturnTarget('https://attacker.example')).toBe(false)
    expect(isGmailReturnTarget('../import')).toBe(false)
  })

  it('rejects expired and already used state metadata', () => {
    const now = new Date('2026-09-05T12:00:00.000Z')
    expect(oauthStateIsUsable({ expiresAt: '2026-09-05T12:00:01.000Z' }, now)).toBe(true)
    expect(oauthStateIsUsable({ expiresAt: '2026-09-05T12:00:00.000Z' }, now)).toBe(false)
    expect(oauthStateIsUsable({ expiresAt: '2026-09-05T12:10:00.000Z', usedAt: '2026-09-05T12:00:00.000Z' }, now)).toBe(false)
  })
})

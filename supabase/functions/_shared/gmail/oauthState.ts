import { randomUrlSafe, sha256Base64Url, sha256Hex } from './crypto'

export const GMAIL_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
export const GMAIL_RETURN_TARGETS = ['local', 'staging', 'production'] as const
export type GmailReturnTarget = (typeof GMAIL_RETURN_TARGETS)[number]

export type NewOAuthState = {
  state: string
  stateHash: string
  pkceVerifier: string
  pkceChallenge: string
  expiresAt: string
  returnTarget: GmailReturnTarget
}

export function isGmailReturnTarget(value: unknown): value is GmailReturnTarget {
  return typeof value === 'string' && GMAIL_RETURN_TARGETS.includes(value as GmailReturnTarget)
}

export async function createOAuthState(returnTarget: GmailReturnTarget, now = new Date()): Promise<NewOAuthState> {
  if (!isGmailReturnTarget(returnTarget) || Number.isNaN(now.getTime())) throw new Error('GMAIL_OAUTH_STATE_INPUT_INVALID')
  const state = randomUrlSafe(32)
  const pkceVerifier = randomUrlSafe(64)
  return {
    state,
    stateHash: await sha256Hex(state),
    pkceVerifier,
    pkceChallenge: await sha256Base64Url(pkceVerifier),
    expiresAt: new Date(now.getTime() + GMAIL_OAUTH_STATE_TTL_MS).toISOString(),
    returnTarget,
  }
}

export function oauthStateIsUsable(input: { expiresAt: string; usedAt?: string | null }, now = new Date()) {
  const expiresAt = new Date(input.expiresAt)
  return !input.usedAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()
}

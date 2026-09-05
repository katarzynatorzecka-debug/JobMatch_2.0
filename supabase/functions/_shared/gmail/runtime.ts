import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { type SecretKeyRing } from './crypto.ts'
import { parseAllowedOrigins } from './cors.ts'
import { GmailEdgeError } from './errors.ts'
import { GoogleHttpGmailGateway } from './googleClient.ts'
import { createGmailService } from './service.ts'
import { createPostgresGmailStore } from './store.ts'

export type GmailFunctionName = 'gmail-oauth-start' | 'gmail-oauth-callback' | 'gmail-connection-status' | 'gmail-search' | 'gmail-import-selected' | 'gmail-confirm-import' | 'gmail-disconnect'

function required(environment: Record<string, string>, name: string) {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`GMAIL_ENV_MISSING:${name}`)
  return value
}

function publishableKey(environment: Record<string, string>) {
  if (environment.SUPABASE_ANON_KEY?.trim()) return environment.SUPABASE_ANON_KEY.trim()
  const keys = JSON.parse(required(environment, 'SUPABASE_PUBLISHABLE_KEYS')) as Record<string, unknown>
  const first = Object.values(keys).find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  if (!first) throw new Error('GMAIL_ENV_MISSING:SUPABASE_PUBLISHABLE_KEYS')
  return first
}

function keyRing(environment: Record<string, string>): SecretKeyRing {
  const keys: Record<number, string> = {}
  for (const [name, value] of Object.entries(environment)) {
    const match = name.match(/^GMAIL_TOKEN_ENCRYPTION_KEY_V([1-9]\d*)$/)
    if (match && value.trim()) keys[Number(match[1])] = value.trim()
  }
  const versions = Object.keys(keys).map(Number)
  if (!versions.length) throw new Error('GMAIL_ENV_MISSING:GMAIL_TOKEN_ENCRYPTION_KEY_V1')
  const activeVersion = environment.GMAIL_TOKEN_ENCRYPTION_ACTIVE_VERSION ? Number(environment.GMAIL_TOKEN_ENCRYPTION_ACTIVE_VERSION) : Math.max(...versions)
  if (!Number.isInteger(activeVersion) || !keys[activeVersion]) throw new Error('GMAIL_TOKEN_ENCRYPTION_ACTIVE_VERSION_INVALID')
  return { activeVersion, keys }
}

function returnTargets(environment: Record<string, string>) {
  const value = JSON.parse(required(environment, 'GMAIL_RETURN_TARGETS')) as Partial<Record<'local' | 'staging' | 'production', unknown>>
  const output = {} as Record<'local' | 'staging' | 'production', string>
  for (const target of ['local', 'staging', 'production'] as const) {
    if (typeof value[target] !== 'string') throw new Error('GMAIL_RETURN_TARGETS_INVALID')
    const url = new URL(value[target] as string)
    if ((url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') || url.origin !== value[target]) throw new Error('GMAIL_RETURN_TARGETS_INVALID')
    output[target] = url.origin
  }
  return output
}

export function createGmailRuntimeHandler(name: GmailFunctionName, environment: Record<string, string>) {
  const supabaseUrl = required(environment, 'SUPABASE_URL')
  const authClient = createClient(supabaseUrl, publishableKey(environment), { auth: { persistSession: false, autoRefreshToken: false } })
  const sql = postgres(required(environment, 'SUPABASE_DB_URL'), { prepare: false, max: 1, idle_timeout: 10 })
  const redirectUri = required(environment, 'GOOGLE_GMAIL_REDIRECT_URI')
  const service = createGmailService({
    async authenticate(request) {
      const authorization = request.headers.get('Authorization')
      const match = authorization?.match(/^Bearer\s+(.+)$/i)
      if (!match) throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 401)
      const { data, error } = await authClient.auth.getUser(match[1])
      if (error || !data.user) throw new GmailEdgeError('GMAIL_PERMISSION_DENIED', 401)
      return data.user.id
    },
    store: createPostgresGmailStore(sql),
    google: new GoogleHttpGmailGateway({
      clientId: required(environment, 'GOOGLE_GMAIL_CLIENT_ID'),
      clientSecret: required(environment, 'GOOGLE_GMAIL_CLIENT_SECRET'),
      redirectUri,
    }),
    config: {
      redirectUri,
      returnTargets: returnTargets(environment),
      allowedOrigins: parseAllowedOrigins(required(environment, 'GMAIL_ALLOWED_ORIGINS')),
      tokenKeys: keyRing(environment),
      messageHmacKey: required(environment, 'GMAIL_MESSAGE_HMAC_KEY_V1'),
    },
  })
  const handlers = {
    'gmail-oauth-start': service.oauthStart,
    'gmail-oauth-callback': service.oauthCallback,
    'gmail-connection-status': service.connectionStatus,
    'gmail-search': service.search,
    'gmail-import-selected': service.importSelected,
    'gmail-confirm-import': service.confirmImport,
    'gmail-disconnect': service.disconnect,
  }
  return handlers[name]
}

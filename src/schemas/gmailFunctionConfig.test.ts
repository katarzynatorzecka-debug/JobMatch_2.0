import { describe, expect, it } from 'vitest'
import config from '../../supabase/config.toml?raw'

const normalizedConfig = config.replace(/\r\n/g, '\n')

const authenticatedFunctions = [
  'gmail-oauth-start',
  'gmail-connection-status',
  'gmail-search',
  'gmail-import-selected',
  'gmail-confirm-import',
  'gmail-disconnect',
]

describe('Gmail Edge Function deployment configuration', () => {
  it('keeps JWT verification enabled for every user endpoint', () => {
    for (const name of authenticatedFunctions) {
      expect(normalizedConfig).toContain(`[functions.${name}]\nverify_jwt = true`)
    }
  })

  it('disables platform JWT verification only for the Google callback', () => {
    expect(normalizedConfig).toContain('[functions.gmail-oauth-callback]\nverify_jwt = false')
    expect(normalizedConfig.match(/verify_jwt = false/g)).toHaveLength(1)
  })
})

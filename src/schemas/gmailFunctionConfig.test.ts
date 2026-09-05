import { describe, expect, it } from 'vitest'
import config from '../../supabase/config.toml?raw'

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
      expect(config).toContain(`[functions.${name}]\nverify_jwt = true`)
    }
  })

  it('disables platform JWT verification only for the Google callback', () => {
    expect(config).toContain('[functions.gmail-oauth-callback]\nverify_jwt = false')
    expect(config.match(/verify_jwt = false/g)).toHaveLength(1)
  })
})

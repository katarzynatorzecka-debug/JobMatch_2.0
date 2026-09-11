import { describe, expect, it } from 'vitest'
import confirmImport from '../../gmail-confirm-import/index.ts?raw'
import connectionStatus from '../../gmail-connection-status/index.ts?raw'
import disconnect from '../../gmail-disconnect/index.ts?raw'
import importSelected from '../../gmail-import-selected/index.ts?raw'
import oauthCallback from '../../gmail-oauth-callback/index.ts?raw'
import oauthStart from '../../gmail-oauth-start/index.ts?raw'
import search from '../../gmail-search/index.ts?raw'
import googleClient from './googleClient.ts?raw'
import reportParser from './reportParser.ts?raw'
import runtime from './runtime.ts?raw'
import service from './service.ts?raw'
import store from './store.ts?raw'

const entrypoints = {
  'gmail-oauth-start': oauthStart,
  'gmail-oauth-callback': oauthCallback,
  'gmail-connection-status': connectionStatus,
  'gmail-search': search,
  'gmail-import-selected': importSelected,
  'gmail-confirm-import': confirmImport,
  'gmail-disconnect': disconnect,
}

describe('Gmail Edge Function gateway manifest', () => {
  it('provides one explicit entrypoint for every configured function', () => {
    for (const [name, source] of Object.entries(entrypoints)) {
      expect(source).toContain(`createGmailRuntimeHandler('${name}'`)
      expect(source).not.toContain("Access-Control-Allow-Origin': '*")
    }
  })

  it('keeps deployed shared code independent from browser src imports and private logging', () => {
    for (const source of [service, googleClient, runtime, store, reportParser]) {
      expect(source).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/\.\.\/src\//)
      expect(source).not.toContain('console.')
      expect(source).not.toContain('analyze-job-match')
      expect(source).not.toContain('workspace_enqueue_analysis')
    }
  })
})

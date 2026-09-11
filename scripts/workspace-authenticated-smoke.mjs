import { createClient } from '@supabase/supabase-js'

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'WORKSPACE_SMOKE_EMAIL', 'WORKSPACE_SMOKE_PASSWORD']
const missing = required.filter((name) => !process.env[name])
if (missing.length) throw new Error(`WORKSPACE_SMOKE_CONFIGURATION_MISSING:${missing.join(',')}`)

const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const runId = `r13-smoke-${Date.now()}`
const now = new Date().toISOString()
const sourceUrl = `https://synthetic.jobmatch.invalid/offers/${runId}`
const evidence = {}

function assert(condition, code) {
  if (!condition) throw new Error(code)
}

async function rpc(name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(`${name}:${error.code ?? 'UNKNOWN'}`)
  return data
}

async function session(id) {
  const { data, error } = await client.from('import_sessions').select('id,status,invalid_count').eq('id', id).maybeSingle()
  if (error || !data) throw new Error('WORKSPACE_SMOKE_SESSION_READ_FAILED')
  return data
}

try {
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email: process.env.WORKSPACE_SMOKE_EMAIL, password: process.env.WORKSPACE_SMOKE_PASSWORD })
  if (signInError || !signedIn.user) throw new Error(`WORKSPACE_SMOKE_SIGN_IN_FAILED:${signInError?.code ?? 'UNKNOWN'}`)

  const item = {
    rawExternalId: `${runId}-offer`, title: 'Synthetic Workspace Smoke Offer', company: 'JobMatch Synthetic', location: 'Warszawa',
    sourceUrl, normalizedSourceUrl: sourceUrl, canonicalFingerprint: `synthetic:${runId}`, contentHash: `content:${runId}`,
    offerData: { title: 'Synthetic Workspace Smoke Offer', company: 'JobMatch Synthetic', location: 'Warszawa', sourceUrl },
  }
  const base = { sourceType: 'synthetic-smoke', fileName: `${runId}.json`, importedAt: now, parserVersion: 'workspace-smoke-v1', items: [item], invalidItems: [], warnings: [] }
  const importA = await rpc('workspace_import_report', { payload: { ...base, idempotencyKey: `${runId}-a` } })
  const importB = await rpc('workspace_import_report', { payload: { ...base, idempotencyKey: `${runId}-b` } })
  assert(importA.status === 'active' && importB.status === 'active', 'WORKSPACE_SMOKE_IMPORT_STATUS_INVALID')
  assert(importA.createdOfferIds.length === 1 && importB.reusedOfferIds.length === 1, 'WORKSPACE_SMOKE_DEDUP_FAILED')

  const offerId = importA.createdOfferIds[0]
  const { data: beforeRevert, error: beforeRevertError } = await client.from('import_offer_links').select('id,job_offer_id').eq('job_offer_id', offerId)
  if (beforeRevertError) throw new Error('WORKSPACE_SMOKE_LINK_READ_FAILED')
  const linkCount = beforeRevert.length

  await rpc('workspace_revert_import', { import_session_id: importB.importSessionId })
  assert((await session(importB.importSessionId)).status === 'reverted', 'WORKSPACE_SMOKE_REVERT_B_FAILED')
  await rpc('workspace_revert_import', { import_session_id: importA.importSessionId })

  const [offer, versions, links, state] = await Promise.all([
    client.from('job_offers').select('id,user_id').eq('id', offerId).maybeSingle(),
    client.from('offer_versions').select('id').eq('job_offer_id', offerId),
    client.from('import_offer_links').select('id').eq('job_offer_id', offerId),
    client.from('offer_user_state').select('id').eq('job_offer_id', offerId).maybeSingle(),
  ])
  if (offer.error || versions.error || links.error || state.error) throw new Error('WORKSPACE_SMOKE_HISTORICAL_READ_FAILED')
  assert(Boolean(offer.data) && Boolean(state.data) && versions.data.length === 1 && links.data.length === linkCount, 'WORKSPACE_SMOKE_HISTORICAL_DETAILS_FAILED')

  await rpc('workspace_reactivate_import', { import_session_id: importB.importSessionId })
  assert((await session(importB.importSessionId)).status === 'active', 'WORKSPACE_SMOKE_REACTIVATE_B_FAILED')
  const retry = await rpc('workspace_import_report', { payload: { ...base, idempotencyKey: `${runId}-b` } })
  assert(retry.idempotent === true && retry.importSessionId === importB.importSessionId, 'WORKSPACE_SMOKE_RETRY_FAILED')

  const [afterVersions, afterLinks, visibleOffers] = await Promise.all([
    client.from('offer_versions').select('id').eq('job_offer_id', offerId),
    client.from('import_offer_links').select('id').eq('job_offer_id', offerId),
    client.from('job_offers').select('user_id').eq('id', offerId),
  ])
  if (afterVersions.error || afterLinks.error || visibleOffers.error) throw new Error('WORKSPACE_SMOKE_FINAL_READ_FAILED')
  assert(afterVersions.data.length === 1 && afterLinks.data.length === linkCount, 'WORKSPACE_SMOKE_REACTIVATE_MUTATED_HISTORY')
  assert(visibleOffers.data.every((row) => row.user_id === signedIn.user.id), 'WORKSPACE_SMOKE_OWNER_SCOPE_FAILED')

  const partial = await rpc('workspace_import_report', { payload: {
    ...base,
    idempotencyKey: `${runId}-partial`,
    items: [{ ...item, rawExternalId: `${runId}-partial-offer`, sourceUrl: `${sourceUrl}/partial`, normalizedSourceUrl: `${sourceUrl}/partial`, canonicalFingerprint: `synthetic:${runId}:partial`, contentHash: `content:${runId}:partial` }],
    invalidItems: [{ rawExternalId: `${runId}-invalid`, reason: 'Synthetic smoke invalid item.' }],
  } })
  assert(partial.status === 'partial', 'WORKSPACE_SMOKE_PARTIAL_IMPORT_FAILED')
  await rpc('workspace_revert_import', { import_session_id: partial.importSessionId })
  await rpc('workspace_reactivate_import', { import_session_id: partial.importSessionId })
  assert((await session(partial.importSessionId)).status === 'partial', 'WORKSPACE_SMOKE_PARTIAL_REACTIVATION_FAILED')

  let crossAccountIsolation = 'pending-second-account'
  if (process.env.WORKSPACE_SMOKE_SECOND_EMAIL && process.env.WORKSPACE_SMOKE_SECOND_PASSWORD) {
    const secondClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    try {
      const { error: secondSignInError } = await secondClient.auth.signInWithPassword({ email: process.env.WORKSPACE_SMOKE_SECOND_EMAIL, password: process.env.WORKSPACE_SMOKE_SECOND_PASSWORD })
      if (secondSignInError) throw new Error(`WORKSPACE_SMOKE_SECOND_SIGN_IN_FAILED:${secondSignInError.code ?? 'UNKNOWN'}`)
      const foreignRead = await secondClient.from('job_offers').select('id').eq('id', offerId)
      assert(!foreignRead.error && foreignRead.data.length === 0, 'WORKSPACE_SMOKE_RLS_FOREIGN_READ_FAILED')
      const foreignWrite = await secondClient.from('offer_user_state').insert({ user_id: signedIn.user.id, job_offer_id: offerId, lifecycle_status: 'new', favorite: false, applied: false, state_metadata: {}, created_at: now, updated_at: now }).select('id')
      assert(Boolean(foreignWrite.error) && (!foreignWrite.data || foreignWrite.data.length === 0), 'WORKSPACE_SMOKE_RLS_FOREIGN_WRITE_FAILED')
      crossAccountIsolation = 'passed'
    } finally {
      await secondClient.auth.signOut()
    }
  }

  Object.assign(evidence, { importA: 'active', importB: 'active', revertB: 'reverted', historicalDetails: 'present', reactivateB: 'active', retry: 'idempotent', partialReactivation: 'partial', ownerScopedRead: 'passed', crossAccountIsolation })
  console.log(JSON.stringify({ status: 'passed', evidence }))
} finally {
  await client.auth.signOut()
}

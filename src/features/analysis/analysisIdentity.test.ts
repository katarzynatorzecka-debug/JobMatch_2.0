import { describe, expect, it } from 'vitest'
import { analysisIdentityMaterial, buildAnalysisIdentity } from './analysisIdentity'

const base = {
  userId: '11111111-1111-4111-8111-111111111111',
  jobOfferId: '22222222-2222-4222-8222-222222222222',
  offerVersionId: '33333333-3333-4333-8333-333333333333',
  profileVersionId: '44444444-4444-4444-8444-444444444444',
  promptVersion: 'jobmatch-job-match-v1',
  modelVersion: 'gpt-5.4-mini',
  algorithmVersion: 'jobmatch-deterministic-r1',
}

describe('analysis identity', () => {
  it('is stable for the same complete business and contract input', async () => {
    expect(analysisIdentityMaterial(base)).toBe(analysisIdentityMaterial({ ...base }))
    await expect(buildAnalysisIdentity(base)).resolves.toMatch(/^[a-f0-9]{64}$/)
    await expect(buildAnalysisIdentity(base)).resolves.toBe(await buildAnalysisIdentity({ ...base }))
  })

  it.each(['userId', 'jobOfferId', 'offerVersionId', 'profileVersionId', 'promptVersion', 'modelVersion', 'algorithmVersion'] as const)('changes when %s changes', async (field) => {
    expect(await buildAnalysisIdentity(base)).not.toBe(await buildAnalysisIdentity({ ...base, [field]: `${base[field]}-changed` }))
  })

  it('changes when the frozen offer-and-manifest contract changes', async () => {
    await expect(buildAnalysisIdentity({ ...base, contractHash: 'a'.repeat(64) })).resolves.not.toBe(await buildAnalysisIdentity({ ...base, contractHash: 'b'.repeat(64) }))
  })
})

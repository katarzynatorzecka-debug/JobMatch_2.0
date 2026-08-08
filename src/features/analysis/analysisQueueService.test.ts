import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ client: null as any }))
vi.mock('../supabase/client', () => ({ get supabase() { return state.client } }))
import { enqueueAndProcessAnalysis } from './analysisQueueService'

describe('analysis queue service', () => {
  it('enqueues before any processor invocation', async () => {
    state.client = null
    const enqueueAnalysis = vi.fn(async () => ({ queueItem: { id: 'queue-1' }, idempotent: false }))
    await expect(enqueueAndProcessAnalysis({ enqueueAnalysis } as never, 'offer-1')).rejects.toMatchObject({ code: 'ANALYSIS_AUTH_REQUIRED' })
    expect(enqueueAnalysis).toHaveBeenCalledWith('offer-1')
  })

  it('keeps an accepted queue in progress when the Edge Function response is transiently unavailable', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: 'timeout' } }))
    state.client = { functions: { invoke } }
    const repository = {
      enqueueAnalysis: vi.fn(async () => ({ queueItem: { id: 'queue-1' }, idempotent: false })),
      loadOfferDetails: vi.fn(async () => ({ analysisState: { latestVersion: null, queueItem: { status: 'processing' } } })),
    }

    await expect(enqueueAndProcessAnalysis(repository as never, 'offer-1')).resolves.toMatchObject({ status: 'in_progress' })
    expect(repository.loadOfferDetails).toHaveBeenCalledWith('offer-1')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('reuses a completed current result without invoking the Edge Function', async () => {
    const repository = {
      enqueueAnalysis: vi.fn(async () => ({ queueItem: { id: 'queue-completed' }, idempotent: true, reused: true })),
    }
    await expect(enqueueAndProcessAnalysis(repository as never, 'offer-1')).resolves.toMatchObject({ status: 'completed', reused: true })
    expect(repository.enqueueAnalysis).toHaveBeenCalledTimes(1)
  })

  it('keeps a completed durable result successful when the invocation response arrives as an error', async () => {
    state.client = { functions: { invoke: vi.fn(async () => ({ data: { code: 'QUEUE_NOT_CLAIMABLE' }, error: null })) } }
    const repository = {
      enqueueAnalysis: vi.fn(async () => ({ queueItem: { id: 'queue-1' }, idempotent: true })),
      loadOfferDetails: vi.fn(async () => ({ analysisState: { latestVersion: { id: 'analysis-1' }, queueItem: null } })),
    }

    await expect(enqueueAndProcessAnalysis(repository as never, 'offer-1')).resolves.toMatchObject({ status: 'completed' })
  })
})

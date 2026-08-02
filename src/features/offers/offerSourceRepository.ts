import type { User } from '@supabase/supabase-js'
import type { OfferSourceResult } from '../../contracts/offerSource'
import { validateOfferSourceResult } from '../../schemas/offerSourceSchemas'
import { supabase } from '../supabase/client'

export interface OfferSourceRepository {
  load(offerId: string): Promise<OfferSourceResult | null>
  save(result: OfferSourceResult): Promise<void>
}

const key = 'jobmatch.offer-sources.v1'
function readLocal(): Record<string, OfferSourceResult> {
  try {
    const raw = sessionStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([offerId, value]) => {
      const valid = validateOfferSourceResult(value)
      return valid.success ? [[offerId, valid.data]] : []
    }))
  } catch { return {} }
}

export const localOfferSourceRepository: OfferSourceRepository = {
  async load(offerId) { return readLocal()[offerId] ?? null },
  async save(result) { sessionStorage.setItem(key, JSON.stringify({ ...readLocal(), [result.offerId]: result })) },
}

export function supabaseOfferSourceRepository(user: User): OfferSourceRepository {
  return {
    async load(offerId) {
      if (!supabase) return null
      const { data } = await supabase.from('job_offers').select('source_data').eq('user_id', user.id).eq('external_id', offerId).not('source_data', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const valid = validateOfferSourceResult(data?.source_data)
      return valid.success ? valid.data : null
    },
    async save(result) {
      if (!supabase) throw new Error('SOURCE_FETCH_FAILED')
      const { error } = await supabase.from('job_offers').update({ source_data: result }).eq('user_id', user.id).eq('external_id', result.offerId)
      if (error) throw new Error('SOURCE_FETCH_FAILED')
    },
  }
}

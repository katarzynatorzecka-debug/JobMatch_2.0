import type { User } from '@supabase/supabase-js'
import type { ImportedJobOffer, ImportedReport } from '../../contracts/import'
import type { UserProfile } from '../../contracts/profile'
import { validateImportedReport } from '../../schemas/importSchemas'
import { validateUserProfile } from '../../schemas/profileSchemas'
import { loadImportedReport, saveImportedReport } from '../import/importSessionStorage'
import { loadUserProfile, saveUserProfile } from '../profile/profileStorage'
import { supabase } from './client'

export type RepoResult<T> = { data: T | null; error?: string }

export interface ProfileRepository {
  load(): Promise<RepoResult<UserProfile>>
  save(profile: UserProfile): Promise<RepoResult<UserProfile>>
}

export interface ImportSessionRepository {
  loadLatest(): Promise<RepoResult<{ id: string; source: ImportedReport['source']; fileName: string; importedAt: string }>>
  create(report: ImportedReport): Promise<RepoResult<{ id: string }>>
}

export interface JobOfferRepository {
  load(sessionId: string): Promise<RepoResult<ImportedJobOffer[]>>
  save(sessionId: string, offers: ImportedJobOffer[]): Promise<RepoResult<ImportedJobOffer[]>>
}

export interface ImportRepository {
  load(): Promise<RepoResult<ImportedReport>>
  save(report: ImportedReport): Promise<RepoResult<ImportedReport>>
}

const cloudError = 'Nie udalo sie polaczyc z zapisem w chmurze. Sprobuj ponownie.'
const unavailableError = 'Konfiguracja Supabase jest niedostepna.'

export const localProfileRepository: ProfileRepository = {
  async load() {
    const result = loadUserProfile()
    return { data: result.profile, error: result.warning }
  },
  async save(profile) {
    const result = saveUserProfile(profile)
    return result.success ? { data: result.data } : { data: null, error: 'Nie udalo sie zapisac profilu lokalnie.' }
  },
}

export function supabaseProfileRepository(user: User): ProfileRepository {
  return {
    async load() {
      if (!supabase) return { data: null, error: unavailableError }
      const { data, error } = await supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
      if (error) return { data: null, error: cloudError }
      if (!data) return { data: null }
      const valid = validateUserProfile(data.profile_data)
      return valid.success ? { data: valid.data } : { data: null, error: 'Zapisany profil ma nieprawidlowy format.' }
    },
    async save(profile) {
      if (!supabase) return { data: null, error: unavailableError }
      const { error } = await supabase.from('profiles').upsert({ user_id: user.id, profile_data: profile }, { onConflict: 'user_id' })
      return error ? { data: null, error: cloudError } : { data: profile }
    },
  }
}

export const localImportRepository: ImportRepository = {
  async load() {
    const result = loadImportedReport()
    return { data: result.report, error: result.warning }
  },
  async save(report) {
    return saveImportedReport(report) ? { data: report } : { data: null, error: 'Nie udalo sie zapisac importu lokalnie.' }
  },
}

export function supabaseImportSessionRepository(user: User): ImportSessionRepository {
  return {
    async loadLatest() {
      if (!supabase) return { data: null, error: unavailableError }
      const { data, error } = await supabase.from('import_sessions').select('id, source_type, source_filename, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) return { data: null, error: cloudError }
      if (!data || data.source_type !== 'rocketjobs-eml') return { data: null }
      return { data: { id: data.id, source: data.source_type, fileName: data.source_filename, importedAt: data.created_at } }
    },
    async create(report) {
      if (!supabase) return { data: null, error: unavailableError }
      const { data, error } = await supabase.from('import_sessions').insert({ user_id: user.id, source_type: report.source, source_filename: report.fileName, offer_count: report.offers.length }).select('id').single()
      return error || !data ? { data: null, error: cloudError } : { data: { id: data.id } }
    },
  }
}

export function supabaseJobOfferRepository(user: User): JobOfferRepository {
  return {
    async load(sessionId) {
      if (!supabase) return { data: null, error: unavailableError }
      const { data, error } = await supabase.from('job_offers').select('normalized_data').eq('user_id', user.id).eq('import_session_id', sessionId).order('created_at')
      if (error) return { data: null, error: cloudError }
      const offers = (data ?? []).map((row) => row.normalized_data)
      const candidate = { version: 1, source: 'rocketjobs-eml', fileName: 'validation.eml', importedAt: new Date().toISOString(), offers, warnings: [] }
      const valid = validateImportedReport(candidate)
      return valid.success ? { data: valid.data.offers } : { data: null, error: 'Zapisane oferty maja nieprawidlowy format.' }
    },
    async save(sessionId, offers) {
      if (!supabase) return { data: null, error: unavailableError }
      if (!offers.length) return { data: [] }
      const rows = offers.map((offer) => ({ user_id: user.id, import_session_id: sessionId, external_id: offer.id, title: offer.title, company: offer.company, url: offer.sourceUrl ?? null, normalized_data: offer }))
      const { error } = await supabase.from('job_offers').insert(rows)
      return error ? { data: null, error: cloudError } : { data: offers }
    },
  }
}

export function supabaseImportRepository(user: User): ImportRepository {
  const sessions = supabaseImportSessionRepository(user)
  const offers = supabaseJobOfferRepository(user)
  return {
    async load() {
      const session = await sessions.loadLatest()
      if (session.error || !session.data) return { data: null, error: session.error }
      const storedOffers = await offers.load(session.data.id)
      if (storedOffers.error || !storedOffers.data) return { data: null, error: storedOffers.error }
      const report = { version: 1 as const, source: session.data.source, fileName: session.data.fileName, importedAt: session.data.importedAt, offers: storedOffers.data, warnings: [] }
      const valid = validateImportedReport(report)
      return valid.success ? { data: valid.data } : { data: null, error: 'Zapisany import ma nieprawidlowy format.' }
    },
    async save(report) {
      const session = await sessions.create(report)
      if (session.error || !session.data) return { data: null, error: session.error }
      const storedOffers = await offers.save(session.data.id, report.offers)
      return storedOffers.error ? { data: null, error: storedOffers.error } : { data: report }
    },
  }
}

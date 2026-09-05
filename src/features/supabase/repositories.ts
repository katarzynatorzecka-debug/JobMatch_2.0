import type { User } from '@supabase/supabase-js'
import type { ImportedJobOffer, ImportedReport } from '../../contracts/import'
import type { UserProfile } from '../../contracts/profile'
import { emptyProfilePresentation } from '../../contracts/profilePresentation'
import type { ProfilePresentationMetadata } from '../../contracts/profilePresentation'
import { validateImportedReport } from '../../schemas/importSchemas'
import { validateUserProfile } from '../../schemas/profileSchemas'
import { loadImportedReport, saveImportedReport } from '../import/importSessionStorage'
import { loadUserProfile, saveUserProfile } from '../profile/profileStorage'
import { clearProfilePresentation, loadProfilePresentation, normalizeProfilePresentation, saveProfilePresentation } from '../profile/profilePresentationStorage'
import { supabase } from './client'
import { synchronizeProfileIntelligence } from '../profile/profileIntelligence'
import { createImportedReport, metadataForImportSource } from '../import/importReportContract'

export type RepoResult<T> = { data: T | null; error?: string }

export interface ProfileRepository {
  load(): Promise<RepoResult<UserProfile> & { presentation: ProfilePresentationMetadata }>
  save(profile: UserProfile, presentation: ProfilePresentationMetadata): Promise<RepoResult<UserProfile> & { presentation: ProfilePresentationMetadata }>
  clearPresentation(): Promise<void>
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
const profileHash = (value: unknown) => { const text = JSON.stringify(value); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619) }; return `profile-v2-${(hash >>> 0).toString(36)}` }

export const localProfileRepository: ProfileRepository = {
  async load() {
    const result = loadUserProfile()
    const presentation = loadProfilePresentation()
    return { data: result.profile, error: result.warning ?? presentation.warning, presentation: presentation.presentation }
  },
  async save(profile, presentationValue) {
    const result = saveUserProfile(profile)
    if (!result.success) return { data: null, error: 'Nie udalo sie zapisac profilu lokalnie.', presentation: emptyProfilePresentation }
    const presentation = saveProfilePresentation(presentationValue)
    return presentation.success ? { data: result.data, presentation: presentation.data } : { data: null, error: presentation.error, presentation: emptyProfilePresentation }
  },
  async clearPresentation() { clearProfilePresentation() },
}

export function supabaseProfileRepository(user: User): ProfileRepository {
  return {
    async load() {
      if (!supabase) return { data: null, error: unavailableError, presentation: emptyProfilePresentation }
      const { data, error } = await supabase.from('profiles').select('profile_data').eq('user_id', user.id).maybeSingle()
      if (error) return { data: null, error: cloudError, presentation: emptyProfilePresentation }
      if (!data) return { data: null, presentation: emptyProfilePresentation }
      const valid = validateUserProfile(data.profile_data)
      if (!valid.success) return { data: null, error: 'Zapisany profil ma nieprawidlowy format.', presentation: emptyProfilePresentation }
      const presentationResult = await supabase.from('profiles').select('presentation_data').eq('user_id', user.id).maybeSingle()
      return { data: valid.data, presentation: presentationResult.error ? emptyProfilePresentation : normalizeProfilePresentation(presentationResult.data?.presentation_data as Partial<ProfilePresentationMetadata> | null) }
    },
    async save(profile, presentationValue) {
      if (!supabase) return { data: null, error: unavailableError, presentation: emptyProfilePresentation }
      const synchronized = synchronizeProfileIntelligence(profile)
      const presentation = normalizeProfilePresentation(presentationValue)
      const { data: row, error } = await supabase.from('profiles').upsert({ user_id: user.id, profile_data: synchronized }, { onConflict: 'user_id' }).select('id').single()
      if (error || !row) return { data: null, error: cloudError, presentation: emptyProfilePresentation }
      const hash = profileHash(synchronized)
      const { data: latest, error: latestError } = await supabase.from('profile_versions').select('id,version_number,content_hash').eq('user_id', user.id).eq('profile_id', row.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
      if (latestError) return { data: null, error: cloudError, presentation: emptyProfilePresentation }
      let versionId = latest?.id ?? null
      if (!latest || latest.content_hash !== hash) {
        const { data: created, error: versionError } = await supabase.from('profile_versions').insert({ user_id: user.id, profile_id: row.id, version_number: (latest?.version_number ?? 0) + 1, profile_data: synchronized, content_hash: hash }).select('id').single()
        if (versionError || !created) return { data: null, error: cloudError, presentation: emptyProfilePresentation }
        versionId = created.id
      }
      const presentationResult = await supabase.from('profiles').update({ presentation_data: presentation, current_version_id: versionId }).eq('user_id', user.id)
      return presentationResult.error ? { data: synchronized, presentation: emptyProfilePresentation } : { data: synchronized, presentation }
    },
    async clearPresentation() {
      if (!supabase) throw new Error(unavailableError)
      const { error } = await supabase.from('profiles').update({ presentation_data: emptyProfilePresentation }).eq('user_id', user.id)
      if (error && !/column|schema cache|does not exist/i.test(error.message ?? '')) throw new Error(cloudError)
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
      if (!data || !['rocketjobs-eml', 'rocketjobs-gmail', 'job-url'].includes(data.source_type)) return { data: null }
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
      const candidate = createImportedReport({ reportProvider: 'rocketjobs', acquisitionChannel: 'eml', fileName: 'validation.eml', importedAt: new Date().toISOString(), offers, warnings: [] })
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
      const metadata = metadataForImportSource(session.data.source)
      const report = createImportedReport({ source: session.data.source, ...metadata, fileName: session.data.fileName, importedAt: session.data.importedAt, offers: storedOffers.data, warnings: [] })
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

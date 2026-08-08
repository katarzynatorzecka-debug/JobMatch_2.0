import { describe, expect, it } from 'vitest'
import type { UserProfile } from '../../contracts/profile'
import { selectDashboardViewModel, profileCompleteness } from './dashboardSelectors'

const profile = (overrides: Partial<UserProfile> = {}) => ({
  primaryRole: 'Operations Manager', experienceSummary: 'Mam wieloletnie doświadczenie w operacjach.', skills: ['SQL'], acceptedWorkModes: ['remote'], acceptedContractTypes: ['employment'], alternativeRoles: ['Project Manager'], acceptedLocations: [], minimumSalary: null, studentStatusAvailable: false, excludedContractTypes: [], excludedWorkModes: [], excludedKeywords: [], requiresStudentStatus: false, additionalMustHave: '', additionalBlacklist: '', priorities: ['experience', 'skills', 'preferences', 'growth'], ...overrides,
}) as UserProfile

const offer = (id: string, overrides: Record<string, unknown> = {}) => ({ id, userId: 'user', sourceType: 'rocketjobs-eml', sourceUrl: null, normalizedSourceUrl: null, canonicalFingerprint: id, title: `Oferta ${id}`, company: `Firma ${id}`, location: null, currentData: {}, sourceData: null, firstSeenAt: '2026-08-07T10:00:00.000Z', lastSeenAt: '2026-08-07T10:00:00.000Z', currentVersionId: null, createdAt: '2026-08-07T10:00:00.000Z', updatedAt: '2026-08-07T10:00:00.000Z', ...overrides })
const snapshot = (offers: unknown[], states: unknown[] = [], hardFilters: unknown[] = [], analyses: unknown[] = [], recentlyViewed: unknown[] = [], sessions: unknown[] = [{ id: 'session-1', userId: 'user', sourceType: 'rocketjobs-eml', sourceFilename: 'raport.eml', status: 'active', foundCount: 1, newCount: 1, duplicateCount: 0, invalidCount: 0, needsReviewCount: 0, warnings: [], operationMetadata: {}, createdAt: '2026-08-07T10:00:00.000Z', revertedAt: null, reactivatedAt: null }]) => ({ profile: null, activeImportSessionId: 'session-1', importSessions: sessions, offers, activeOffers: offers, profileVersions: [], offerVersions: [], importOfferLinks: (offers as Array<{ id: string }>).map((entry) => ({ id: `link-${entry.id}`, userId: 'user', importSessionId: 'session-1', jobOfferId: entry.id, offerVersionId: null, matchType: 'new', rawExternalId: entry.id, dedupEvidence: {}, isNew: true, isDuplicate: false, needsReview: false, createdAt: '2026-08-07T10:00:00.000Z' })), offerUserStates: states, hardFilterResults: hardFilters, analyses, legacyAnalysisIssues: [], analysisQueue: [], workspaceAnalyses: [], analysisVersions: [], recentlyViewed, }) as never
const state = (id: string, overrides: Record<string, unknown> = {}) => ({ id: `state-${id}`, userId: 'user', jobOfferId: id, lifecycleStatus: 'new', favorite: false, applied: false, exclusionReason: null, stateMetadata: {}, excludedAt: null, restoredAt: null, lastViewedAt: null, createdAt: '2026-08-07T10:00:00.000Z', updatedAt: '2026-08-07T10:00:00.000Z', ...overrides })
const hardFilter = (id: string, status: 'pass' | 'needs_review' | 'fail' = 'pass') => ({ id: `hf-${id}`, userId: 'user', jobOfferId: id, offerVersionId: 'version', profileVersionId: 'profile', status, reasons: [], missingInformation: [], checkedCriteria: [], algorithmVersion: 'hf-v1', createdAt: '2026-08-07T10:00:00.000Z', isCurrent: true })
const analysis = (id: string, score: number, recommendation = 'Warto aplikować') => ({ offerId: id, overallScore: score, recommendation, summary: 'Aktualny wynik.', categoryScores: { experience: { score, rationale: 'ok' }, skills: { score, rationale: 'ok' }, preferences: { score, rationale: 'ok' }, growth: { score, rationale: 'ok' } }, strengths: [], risks: [], missingInformation: [], hardFilterStatus: 'pass', hardFilterReasons: [], sourceQuality: 'full', modelInfo: { provider: 'openai', model: 'test', provisional: false }, createdAt: '2026-08-07T10:00:00.000Z', status: 'ready' })

describe('dashboard selectors', () => {
  it('summarizes profile and flags missing important fields', () => {
    expect(profileCompleteness(profile()).percentage).toBe(100)
    expect(profileCompleteness(profile({ skills: [], acceptedWorkModes: [] })).percentage).toBe(60)
    expect(selectDashboardViewModel({ snapshot: snapshot([]), profile: profile({ skills: [] }) }).profile.profileNeedsAttention).toBe(true)
  })

  it('selects recently viewed, favorites, new, applied and excluded canonical cards', () => {
    const offers = [offer('one'), offer('two'), offer('three'), offer('four')]
    const vm = selectDashboardViewModel({ snapshot: snapshot(offers, [state('one', { favorite: true, lifecycleStatus: 'analyzed' }), state('two', { applied: true, lifecycleStatus: 'analyzed' }), state('three', { lifecycleStatus: 'excluded', exclusionReason: 'user_decision' }), state('four', { lifecycleStatus: 'new' })], [hardFilter('one'), hardFilter('two'), hardFilter('four')], [analysis('one', 50), analysis('two', 40)], [{ userId: 'user', jobOfferId: 'two', viewedAt: '2026-08-07T12:00:00.000Z' }]), profile: profile() })
    expect(vm.offers.recentlyViewed.map((item) => item.offerId)).toEqual(['two'])
    expect(vm.offers.favorites.map((item) => item.offerId)).toEqual(['one'])
    expect(vm.offers.applied.map((item) => item.offerId)).toEqual(['two'])
    expect(vm.offers.excluded.map((item) => item.offerId)).toEqual(['three'])
    expect(vm.offers.newOffers.map((item) => item.offerId)).toEqual(['four'])
  })

  it('recommends only active analyzed offers and excludes Hard Filter FAIL', () => {
    const offers = [offer('good'), offer('fail'), offer('missing')]
    const vm = selectDashboardViewModel({ snapshot: snapshot(offers, [state('good'), state('fail'), state('missing')], [hardFilter('good'), hardFilter('fail', 'fail'), hardFilter('missing')], [analysis('good', 90), analysis('fail', 99)]), profile: profile() })
    expect(vm.offers.recommended.map((item) => item.offerId)).toEqual(['good'])
    expect(vm.offers.recommended[0]).toMatchObject({ score: 90, analysisAvailable: true, hardFilterStatus: 'pass' })
  })

  it('maps import history and deterministic next steps', () => {
    const sessions = [{ id: 'session-1', userId: 'user', sourceType: 'rocketjobs-eml', sourceFilename: 'new.eml', status: 'active', foundCount: 3, newCount: 2, duplicateCount: 1, invalidCount: 0, needsReviewCount: 1, warnings: [], operationMetadata: {}, createdAt: '2026-08-07T10:00:00.000Z', revertedAt: null, reactivatedAt: null }]
    const empty = selectDashboardViewModel({ snapshot: snapshot([], [], [], [], [], []), profile: profile() })
    const toAnalyze = selectDashboardViewModel({ snapshot: snapshot([offer('new')], [state('new')], [hardFilter('new')], [], [], sessions), profile: profile() })
    const analyzed = selectDashboardViewModel({ snapshot: snapshot([offer('done')], [state('done', { lifecycleStatus: 'analyzed' })], [hardFilter('done')], [analysis('done', 70)], [], sessions), profile: profile() })
    expect(empty.nextStep).toMatchObject({ key: 'import-report', target: '/import' })
    expect(toAnalyze.nextStep).toMatchObject({ key: 'analyze-offers', target: '/offers' })
    expect(analyzed.nextStep).toMatchObject({ key: 'review-results', target: '/offers' })
    expect(analyzed.importHistory[0]).toMatchObject({ sourceFilename: 'new.eml', newCount: 2, duplicateCount: 1, needsReviewCount: 1 })
  })

  it('uses profile and offer availability without inventing provider state', () => {
    const vm = selectDashboardViewModel({ snapshot: snapshot([offer('one')]), profile: profile(), profileAvailability: 'available' })
    expect(vm.availability).toEqual({ cv: 'available', message: 'available' })
    expect(selectDashboardViewModel({ snapshot: snapshot([]), profile: profile() }).availability.cv).toBe('unavailable')
    const missing = selectDashboardViewModel({ snapshot: snapshot([]), profile: null, profileAvailability: 'missing' })
    expect(missing.availability).toEqual({ cv: 'missing', message: 'unavailable' })
  })

  it('keeps selector output separated for independent auth/demo inputs', () => {
    const auth = selectDashboardViewModel({ snapshot: snapshot([offer('auth')], [state('auth', { lifecycleStatus: 'new' })]), profile: profile({ primaryRole: 'Auth role' }) })
    const demo = selectDashboardViewModel({ snapshot: snapshot([offer('demo')], [state('demo', { lifecycleStatus: 'new' })]), profile: profile({ primaryRole: 'Demo role' }) })
    expect(auth.profile.primaryRole).toBe('Auth role')
    expect(auth.offers.newOffers.map((item) => item.offerId)).toEqual(['auth'])
    expect(demo.profile.primaryRole).toBe('Demo role')
    expect(demo.offers.newOffers.map((item) => item.offerId)).toEqual(['demo'])
  })
})
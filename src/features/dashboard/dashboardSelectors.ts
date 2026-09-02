import type { UserProfile } from '../../contracts/profile'
import type { ProfilePresentationMetadata } from '../../contracts/profilePresentation'
import type { WorkspaceHardFilterStatus } from '../../contracts/workspace'
import type { WorkspaceSnapshot } from '../workspace/workspaceRepository'
import type { WorkspaceOfferListItem } from '../workspace/workspaceRepository'
import { projectWorkspaceOfferList } from '../workspace/workspaceReadModel'

export type DashboardAvailability = 'available' | 'missing' | 'unavailable'
export type DashboardOfferCard = {
  offerId: string
  title: string
  company: string
  score: number | null
  reliability: 'standard' | 'limited' | null
  coverage: number | null
  recommendation: string | null
  hardFilterStatus: WorkspaceHardFilterStatus | null
  analysisAvailable: boolean
  href: string
}
export type DashboardProfileSummary = {
  fullName: string | null
  primaryRole: string
  alternativeRoles: string[]
  completeness: { completed: number; total: number; percentage: number }
  profileNeedsAttention: boolean
  href: '/profile'
}
export type DashboardImportSession = {
  id: string
  createdAt: string
  sourceType: string
  sourceFilename: string
  newCount: number
  duplicateCount: number
  invalidCount: number
  needsReviewCount: number
}
export type DashboardNextStep = {
  key: 'complete-profile' | 'import-report' | 'analyze-offers' | 'review-results'
  title: string
  target: '/profile' | '/import' | '/offers'
}
export type DashboardViewModel = {
  profile: DashboardProfileSummary
  offers: {
    recentlyViewed: DashboardOfferCard[]
    recommended: DashboardOfferCard[]
    favorites: DashboardOfferCard[]
    newOffers: DashboardOfferCard[]
    applied: DashboardOfferCard[]
    excluded: DashboardOfferCard[]
  }
  importHistory: DashboardImportSession[]
  nextStep: DashboardNextStep
  availability: { cv: DashboardAvailability; message: DashboardAvailability }
}

export type DashboardSelectorInput = {
  snapshot: WorkspaceSnapshot
  profile: UserProfile | null
  profilePresentation?: ProfilePresentationMetadata | null
  profileAvailability?: DashboardAvailability
}

const COMPLETENESS_TOTAL = 5

const completenessFields = (profile: UserProfile) => [
  Boolean(profile.primaryRole.trim()),
  profile.experienceSummary.trim().length >= 20,
  profile.skills.length > 0,
  profile.acceptedWorkModes.length > 0,
  profile.acceptedContractTypes.length > 0,
]

export function profileCompleteness(profile: UserProfile | null) {
  if (!profile) return { completed: 0, total: COMPLETENESS_TOTAL, percentage: 0 }
  const checks = completenessFields(profile)
  const completed = checks.filter(Boolean).length
  return { completed, total: checks.length, percentage: Math.round((completed / checks.length) * 100) }
}

function toCard(item: WorkspaceOfferListItem): DashboardOfferCard {
  return {
    offerId: item.offer.id,
    title: item.offer.title,
    company: item.offer.company,
    score: item.analysis?.overallScore ?? null,
    reliability: item.analysis?.scoring?.reliability ?? null,
    coverage: item.analysis?.scoring?.coverage ?? null,
    recommendation: item.analysis?.recommendation ?? null,
    hardFilterStatus: item.hardFilter?.status ?? null,
    analysisAvailable: Boolean(item.analysis),
    href: `/offers/${encodeURIComponent(item.offer.id)}`,
  }
}

function reportDate(item: WorkspaceOfferListItem) {
  const timestamp = item.latestImportSessionAt ? Date.parse(item.latestImportSessionAt) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function newestFirst(left: WorkspaceOfferListItem, right: WorkspaceOfferListItem) {
  return reportDate(right) - reportDate(left) || right.offer.id.localeCompare(left.offer.id)
}

function scoreFirst(left: WorkspaceOfferListItem, right: WorkspaceOfferListItem) {
  const reliability = (item: WorkspaceOfferListItem) => item.analysis?.scoring?.reliability === 'standard' ? 2 : item.analysis?.scoring?.reliability === 'limited' ? 1 : 0
  const coverage = (item: WorkspaceOfferListItem) => item.analysis?.scoring?.coverage ?? 0
  return reliability(right) - reliability(left) || coverage(right) - coverage(left) || (right.analysis?.overallScore ?? -1) - (left.analysis?.overallScore ?? -1) || newestFirst(left, right)
}

function activeAndVisible(item: WorkspaceOfferListItem) {
  return item.isActive && item.userState?.lifecycleStatus !== 'excluded'
}

function currentItems(snapshot: WorkspaceSnapshot) {
  return projectWorkspaceOfferList(snapshot, true)
}

function mapItems(items: WorkspaceOfferListItem[]) {
  return items.map(toCard)
}

function nextStep(profile: UserProfile | null, profileNeedsAttention: boolean, snapshot: WorkspaceSnapshot, items: WorkspaceOfferListItem[], offersToAnalyze: WorkspaceOfferListItem[], recommended: WorkspaceOfferListItem[]): DashboardNextStep {
  if (!profile || profileNeedsAttention) return { key: 'complete-profile', title: 'Uzupełnij profil', target: '/profile' }
  if (!snapshot.importSessions.length || !items.some((item) => item.isActive)) return { key: 'import-report', title: 'Dodaj pierwszy raport', target: '/import' }
  if (offersToAnalyze.length) return { key: 'analyze-offers', title: 'Przeanalizuj nowe oferty', target: '/offers' }
  if (recommended.length) return { key: 'review-results', title: 'Sprawdź polecane oferty', target: '/offers' }
  return { key: 'import-report', title: 'Dodaj kolejny raport', target: '/import' }
}

export function selectDashboardViewModel(input: DashboardSelectorInput): DashboardViewModel {
  const { snapshot, profile } = input
  const items = currentItems(snapshot)
  const byId = new Map(items.map((item) => [item.offer.id, item]))
  const activeVisible = items.filter(activeAndVisible)
  const recommendedItems = activeVisible.filter((item) => item.hardFilter?.status !== 'fail' && item.analysis?.recommendation === 'Warto aplikować' && item.analysis.scoring?.reliability !== 'limited').sort(scoreFirst)
  const offersToAnalyze = activeVisible.filter((item) => item.hardFilter && item.hardFilter.status !== 'fail' && !item.analysis && !item.analysisState.queueItem).sort(newestFirst)
  const viewedIds = [...snapshot.recentlyViewed].sort((left, right) => Date.parse(right.viewedAt) - Date.parse(left.viewedAt)).map((entry) => entry.jobOfferId)
  const profileSummary = profileCompleteness(profile)
  const profileNeedsAttention = Boolean(profile && profileSummary.completed < profileSummary.total)
  const cv = input.profileAvailability ?? (profile ? 'unavailable' : 'missing')
  const message: DashboardAvailability = profile && items.length ? 'available' : 'unavailable'
  const cardList = (predicate: (item: WorkspaceOfferListItem) => boolean, sort = newestFirst) => mapItems(items.filter(predicate).sort(sort))
  return {
    profile: {
      fullName: input.profilePresentation?.fullName ?? null,
      primaryRole: profile?.primaryRole ?? '',
      alternativeRoles: profile?.alternativeRoles ?? [],
      completeness: profileSummary,
      profileNeedsAttention,
      href: '/profile',
    },
    offers: {
      recentlyViewed: mapItems(viewedIds.map((id) => byId.get(id)).filter((item): item is WorkspaceOfferListItem => Boolean(item))),
      recommended: mapItems(recommendedItems),
      favorites: cardList((item) => item.userState?.favorite === true),
      newOffers: cardList((item) => activeAndVisible(item) && item.userState?.lifecycleStatus === 'new'),
      applied: cardList((item) => item.userState?.applied === true),
      excluded: cardList((item) => item.userState?.lifecycleStatus === 'excluded'),
    },
    importHistory: [...snapshot.importSessions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).map((session) => ({ id: session.id, createdAt: session.createdAt, sourceType: session.sourceType, sourceFilename: session.sourceFilename, newCount: session.newCount, duplicateCount: session.duplicateCount, invalidCount: session.invalidCount, needsReviewCount: session.needsReviewCount })),
    nextStep: nextStep(profile, profileNeedsAttention, snapshot, items, offersToAnalyze, recommendedItems),
    availability: { cv, message },
  }
}

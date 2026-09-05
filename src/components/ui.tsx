import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { statusMeta, type DemoOffer, type DemoStatus } from '../demo/offers'
import type { HardFilterStatus } from '../contracts/hardFilter'
import type { AnalysisCategory, AnalysisCriterion, JobAnalysis } from '../contracts/jobAnalysis'
import type { WorkspaceAnalysisState } from '../contracts/workspace'
import { analysisDateLabel, analysisStateLabel, criterionMatchTypeLabel, criterionOutcomeLabel, hardFilterReasonLabel, hardFilterReasonLabels, recommendationLabel, sourceQualityLabel } from '../features/workspace/presentationLabels'
import { translate, useI18n } from '../i18n/I18nProvider'

export function PageHeader({ eyebrow = 'JobMatch', title, intro, actions }: { eyebrow?: string; title: string; intro: string; actions?: ReactNode }) { return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-intro">{intro}</p>{actions}</header> }
export function PrimaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button--primary ${className}`} {...props}>{children}</button> }
export function SecondaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button--secondary ${className}`} {...props}>{children}</button> }
export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="button button--primary" to={to}>{children}</Link> }
export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="button button--secondary" to={to}>{children}</Link> }
const statusLabelKeys = { worth: 'ui.status.worth', review: 'ui.status.review', rejected: 'ui.status.rejected' } as const
export function StatusBadge({ status }: { status: DemoStatus }) { const { t } = useI18n(); const meta = statusMeta[status]; return <span className={`status-badge status-badge--${status}`}><span aria-hidden="true">{meta.symbol}</span>{t(statusLabelKeys[status])}</span> }
const hardFilterMeta: Record<HardFilterStatus, { labelKey: 'ui.hardFilter.pass' | 'ui.hardFilter.review' | 'ui.hardFilter.fail'; symbol: string }> = { pass: { labelKey: 'ui.hardFilter.pass', symbol: '✓' }, weak: { labelKey: 'ui.hardFilter.review', symbol: '?' }, fail: { labelKey: 'ui.hardFilter.fail', symbol: '×' } }
export function HardFilterStatusBadge({ status }: { status: HardFilterStatus }) { const { t } = useI18n(); const meta = hardFilterMeta[status]; return <span className={`status-badge status-badge--hard-${status}`}><span aria-hidden="true">{meta.symbol}</span>{t(meta.labelKey)}</span> }
export function ScoreBadge({ score, limited = false }: { score: number; limited?: boolean }) { const { t } = useI18n(); return <span className={`score-badge${limited ? ' score-badge--limited' : ''}`} aria-label={limited ? t('ui.score.partialAria', { score }) : t('ui.score.standardAria', { score })}><strong>{score}</strong><span>/100</span>{limited && <small>{t('ui.score.partialLabel')}</small>}</span> }
export function SourceBadge({ state }: { state: DemoOffer['sourceState'] }) { const { t } = useI18n(); return <span className="source-badge"><span aria-hidden="true">▣</span>{state === 'fallback' ? t('ui.source.fallback') : t('ui.source.partial')}</span> }
export function CategoryScore({ label, score }: { label: string; score: number | null }) { const { t } = useI18n(); if (score === null) return <div className="category-score"><div><span>{label}</span><strong>{t('ui.noData')}</strong></div></div>; return <div className="category-score"><div><span>{label}</span><strong>{score}/100</strong></div><div className="progress-track" aria-label={t('ui.score.progressAria', { label, score })}><span style={{ width: `${score}%` }} /></div></div> }
const categoryLabelKeys = { experience: 'ui.analysis.category.experience', skills: 'ui.analysis.category.skills', preferences: 'ui.analysis.category.preferences', growth: 'ui.analysis.category.growth' } as const
export function formatPercentage(value: number) { return `${Math.round(value)}%` }
export function HardFilterReason({ reasons }: { reasons: unknown[] }) {
  const { t, locale } = useI18n()
  const labels = hardFilterReasonLabels(reasons, locale)
  if (!labels.length) return null
  return <div className="hard-filter-reasons"><strong>{t('ui.hardFilter.reason')}</strong><ul>{labels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul></div>
}
export function SourceQualityLabel({ value }: { value: JobAnalysis['sourceQuality'] }) { const { t, locale } = useI18n(); return <span className="analysis-meta__source">{t('ui.meta.source')} {sourceQualityLabel(value, locale)}</span> }
export function AnalysisMetadata({ analysis, state }: { analysis: JobAnalysis; state: WorkspaceAnalysisState }) {
  const { t, locale } = useI18n()
  return <div className="analysis-meta"><span>{t('ui.meta.state')} {analysisStateLabel({ queueStatus: state.queueItem?.status, errorCode: state.errorCode, freshness: state.freshness }, locale)}</span><span>{analysisDateLabel(state.lastAnalysisAt ?? analysis.createdAt, locale)}</span><SourceQualityLabel value={analysis.sourceQuality} /></div>
}
function criterionList(analysis: JobAnalysis, category: AnalysisCategory): AnalysisCriterion[] {
  const value = analysis.criteria?.[category]
  return Array.isArray(value) ? value : []
}
function readableFingerprint(item: string) {
  return item.trim().toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^(ryzyko|brakuje|brak(?: danych| informacji| potwierdzenia)?)\s*:\s*/i, '')
    .replace(/^(ryzyko|brakuje|brak danych|brak informacji(?: o)?|brak potwierdzenia)\s+/i, '')
    .replace(/[^a-z0-9+#.]+/g, ' ').trim().replace(/\s+/g, ' ')
}
function uniqueReadable(items: string[]) {
  return items.filter((item, index) => {
    const value = readableFingerprint(item)
    return value && !items.slice(0, index).some((previous) => readableFingerprint(previous) === value)
  })
}
export function analysisNarrativeData(analysis: JobAnalysis | null | undefined, locale: 'pl' | 'en' = 'pl') {
  if (!analysis) return null
  const hardFilterReason = analysis.hardFilterReasons[0]
    ? hardFilterReasonLabel(analysis.hardFilterReasons[0], locale) ?? analysis.hardFilterReasons[0]
    : null
  const headline = analysis.recommendation === 'Warto aplikować'
    ? translate(locale, 'domain.narrative.match')
    : analysis.recommendation === 'Nie rekomenduję'
      ? translate(locale, 'domain.narrative.reject')
      : translate(locale, 'domain.narrative.review')
  const hardFilterWarning = analysis.hardFilterStatus === 'weak' && hardFilterReason
    ? translate(locale, 'domain.narrative.confirm', { reason: hardFilterReason })
    : analysis.hardFilterStatus === 'fail' && hardFilterReason
      ? translate(locale, 'domain.narrative.conflict', { reason: hardFilterReason })
      : null
  return {
    headline,
    recommendation: recommendationLabel(analysis.recommendation, locale),
    summary: analysis.summary,
    strengths: analysis.strengths.slice(0, 3),
    risks: uniqueReadable([...analysis.risks, ...analysis.missingInformation]).slice(0, 3),
    hardFilterWarning,
  }
}
export function AnalysisNarrative({ analysis, compact = false }: { analysis: JobAnalysis; compact?: boolean }) {
  const { t, locale } = useI18n()
  const narrative = analysisNarrativeData(analysis, locale)
  if (!narrative) return null
  return <div className={`analysis-narrative${compact ? ' analysis-narrative--compact' : ''}`}>
    <p className="analysis-narrative__recommendation"><strong>{t('ui.analysis.recommendation')}</strong> {narrative.recommendation}</p>
    <p className="analysis-narrative__summary"><strong>{narrative.headline}.</strong> {narrative.summary}</p>
    {!compact && narrative.strengths.length > 0 && <div className="analysis-narrative__block"><h3>{t('ui.analysis.strengths')}</h3><ul className="check-list">{narrative.strengths.map((strength, index) => <li key={`${strength}-${index}`}>{strength}</li>)}</ul></div>}
    {!compact && narrative.risks.length > 0 && <div className="analysis-narrative__block"><h3>{t('ui.analysis.checkBefore')}</h3><ul className="risk-list">{narrative.risks.map((risk, index) => <li key={`${risk}-${index}`}>{risk}</li>)}</ul></div>}
    {compact && narrative.strengths[0] && <p className="analysis-narrative__compact-line"><strong>{t('ui.analysis.strength')}</strong> {narrative.strengths[0]}</p>}
    {compact && narrative.risks[0] && <p className="analysis-narrative__compact-line"><strong>{t('ui.analysis.check')}</strong> {narrative.risks[0]}</p>}
    {narrative.hardFilterWarning && <p className="analysis-narrative__hard-filter"><strong>Hard Filter:</strong> {narrative.hardFilterWarning}</p>}
  </div>
}
export function AnalysisQuality({ analysis, detailed = false }: { analysis: JobAnalysis; detailed?: boolean }) {
  const { t, locale } = useI18n()
  const scoring = analysis.scoring
  const coverage = scoring?.coverage
  const confidence = scoring?.criterionConfidence
  const limited = scoring?.reliability === 'limited'
  if (!scoring && !analysis.criteria) return <AnalysisNarrative analysis={analysis} compact />
  return <div className={`analysis-quality${detailed ? ' analysis-quality--detailed' : ''}`}>
    {!detailed && <AnalysisNarrative analysis={analysis} />}
    <p><strong>{limited ? (typeof coverage === 'number' ? t('ui.analysis.partialWithCoverage', { score: analysis.overallScore, coverage: formatPercentage(coverage) }) : t('ui.analysis.partial', { score: analysis.overallScore })) : `${analysis.overallScore}/100`}</strong>{limited && <span className="analysis-quality__limited">{t('ui.analysis.notFull')}</span>}</p>
    <div className="analysis-quality__metrics"><span>{t('ui.analysis.coverage', { value: typeof coverage === 'number' ? formatPercentage(coverage) : t('ui.noData') })}</span><span>{t('ui.analysis.confidence', { value: typeof confidence === 'number' ? `${confidence}%` : t('ui.noData') })}</span><span>{t('ui.analysis.reliability', { value: scoring?.reliability === 'standard' ? t('ui.analysis.reliabilityStandard') : scoring?.reliability === 'limited' ? t('ui.analysis.reliabilityLimited') : t('ui.noData') })}</span></div>
    {detailed && <div className="analysis-quality__criteria">{(['experience', 'skills', 'preferences', 'growth'] as AnalysisCategory[]).map((category) => {
      const items = criterionList(analysis, category)
      if (!items.length) return <div key={category}><strong>{t(categoryLabelKeys[category])}</strong><p>{t('ui.analysis.noHistoricalCriteria')}</p></div>
      return <div key={category}><strong>{t(categoryLabelKeys[category])}</strong><ul>{items.map((criterion) => { const matchType = criterionMatchTypeLabel(criterion.matchType, locale); return <li key={criterion.id}><b>{criterion.requirement}</b> — {criterionOutcomeLabel(criterion.outcome, locale)}{matchType ? ` · ${matchType}` : ''}; {t('ui.analysis.criterionConfidence', { confidence: criterion.confidence })}<br /><span>{criterion.rationale}</span><br />{criterion.outcome === 'UNKNOWN' ? <em>{t('ui.analysis.noConfirmingData')}</em> : <><small>{t('ui.analysis.profileEvidence')} {criterion.profileEvidence.join('; ') || t('ui.analysis.noEvidence')}</small><br /><small>{t('ui.analysis.offerEvidence')} {criterion.offerEvidence.join('; ') || t('ui.analysis.noEvidence')}</small></>}</li> })}</ul></div>
    })}</div>}
  </div>
}
export function Alert({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'success' | 'warning' }) { return <div className={`alert alert--${tone}`} role="status"><strong>{title}</strong><span>{children}</span></div> }
export function SectionCard({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) { return <section className={`surface-card ${className}`}>{title && <h2>{title}</h2>}{children}</section> }

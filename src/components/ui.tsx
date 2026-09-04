import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { statusMeta, type DemoOffer, type DemoStatus } from '../demo/offers'
import type { HardFilterStatus } from '../contracts/hardFilter'
import type { AnalysisCategory, AnalysisCriterion, JobAnalysis } from '../contracts/jobAnalysis'
import type { WorkspaceAnalysisState } from '../contracts/workspace'
import { analysisDateLabel, analysisStateLabel, criterionMatchTypeLabel, criterionOutcomeLabel, hardFilterReasonLabels, sourceQualityLabel } from '../features/workspace/presentationLabels'

export function PageHeader({ eyebrow = 'JobMatch', title, intro, actions }: { eyebrow?: string; title: string; intro: string; actions?: ReactNode }) { return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-intro">{intro}</p>{actions}</header> }
export function PrimaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button--primary ${className}`} {...props}>{children}</button> }
export function SecondaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button--secondary ${className}`} {...props}>{children}</button> }
export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="button button--primary" to={to}>{children}</Link> }
export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="button button--secondary" to={to}>{children}</Link> }
export function StatusBadge({ status }: { status: DemoStatus }) { const meta = statusMeta[status]; return <span className={`status-badge status-badge--${status}`}><span aria-hidden="true">{meta.symbol}</span>{meta.label}</span> }
const hardFilterMeta: Record<HardFilterStatus, { label: string; symbol: string }> = { pass: { label: 'Przechodzi', symbol: '✓' }, weak: { label: 'Wymaga sprawdzenia', symbol: '?' }, fail: { label: 'Odrzucona', symbol: '×' } }
export function HardFilterStatusBadge({ status }: { status: HardFilterStatus }) { const meta = hardFilterMeta[status]; return <span className={`status-badge status-badge--hard-${status}`}><span aria-hidden="true">{meta.symbol}</span>{meta.label}</span> }
export function ScoreBadge({ score, limited = false }: { score: number; limited?: boolean }) { return <span className={`score-badge${limited ? ' score-badge--limited' : ''}`} aria-label={limited ? `Wynik częściowy: ${score} na 100, wiarygodność ograniczona` : `Ocena dopasowania: ${score} na 100`}><strong>{score}</strong><span>/100</span>{limited && <small>wynik częściowy</small>}</span> }
export function SourceBadge({ state }: { state: DemoOffer['sourceState'] }) { return <span className="source-badge"><span aria-hidden="true">▣</span>{state === 'fallback' ? 'Użyto danych zapasowych' : 'Analiza na podstawie częściowych danych'}</span> }
export function CategoryScore({ label, score }: { label: string; score: number | null }) { if (score === null) return <div className="category-score"><div><span>{label}</span><strong>Brak danych</strong></div></div>; return <div className="category-score"><div><span>{label}</span><strong>{score}/100</strong></div><div className="progress-track" aria-label={`${label}: ${score} na 100`}><span style={{ width: `${score}%` }} /></div></div> }
const categoryLabels: Record<AnalysisCategory, string> = { experience: 'Doświadczenie', skills: 'Umiejętności', preferences: 'Preferencje', growth: 'Rozwój' }
export function formatPercentage(value: number) { return `${Math.round(value)}%` }
export function HardFilterReason({ reasons }: { reasons: unknown[] }) {
  const labels = hardFilterReasonLabels(reasons)
  if (!labels.length) return <p>Brak potwierdzonych konfliktów.</p>
  return <div className="hard-filter-reasons"><strong>Powód:</strong><ul>{labels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul></div>
}
export function SourceQualityLabel({ value }: { value: JobAnalysis['sourceQuality'] }) { return <span className="analysis-meta__source">Zródlo: {sourceQualityLabel(value)}</span> }
export function AnalysisMetadata({ analysis, state }: { analysis: JobAnalysis; state: WorkspaceAnalysisState }) {
  return <div className="analysis-meta"><span>Stan: {analysisStateLabel({ queueStatus: state.queueItem?.status, errorCode: state.errorCode, freshness: state.freshness })}</span><span>{analysisDateLabel(state.lastAnalysisAt ?? analysis.createdAt)}</span><SourceQualityLabel value={analysis.sourceQuality} /></div>
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
export function analysisNarrativeData(analysis: JobAnalysis | null | undefined) {
  if (!analysis) return null
  const headline = analysis.recommendation === 'Warto aplikować'
    ? 'Dlaczego ta oferta pasuje'
    : analysis.recommendation === 'Nie rekomenduję'
      ? 'Dlaczego ta oferta nie jest rekomendowana'
      : 'Co warto sprawdzić przed decyzją'
  const hardFilterWarning = analysis.hardFilterStatus === 'weak' && analysis.hardFilterReasons[0]
    ? `Wymaga potwierdzenia: ${analysis.hardFilterReasons[0]}`
    : analysis.hardFilterStatus === 'fail' && analysis.hardFilterReasons[0]
      ? `Konflikt z profilem: ${analysis.hardFilterReasons[0]}`
      : null
  return {
    headline,
    recommendation: analysis.recommendation,
    summary: analysis.summary,
    strengths: analysis.strengths.slice(0, 3),
    risks: uniqueReadable([...analysis.risks, ...analysis.missingInformation]).slice(0, 3),
    hardFilterWarning,
  }
}
export function AnalysisNarrative({ analysis, compact = false }: { analysis: JobAnalysis; compact?: boolean }) {
  const narrative = analysisNarrativeData(analysis)
  if (!narrative) return null
  return <div className={`analysis-narrative${compact ? ' analysis-narrative--compact' : ''}`}>
    <p className="analysis-narrative__recommendation"><strong>Rekomendacja:</strong> {narrative.recommendation}</p>
    <p className="analysis-narrative__summary"><strong>{narrative.headline}.</strong> {narrative.summary}</p>
    {!compact && narrative.strengths.length > 0 && <div className="analysis-narrative__block"><h3>Silne strony kandydata</h3><ul className="check-list">{narrative.strengths.map((strength, index) => <li key={`${strength}-${index}`}>{strength}</li>)}</ul></div>}
    {!compact && narrative.risks.length > 0 && <div className="analysis-narrative__block"><h3>Do sprawdzenia przed aplikowaniem</h3><ul className="risk-list">{narrative.risks.map((risk, index) => <li key={`${risk}-${index}`}>{risk}</li>)}</ul></div>}
    {compact && narrative.strengths[0] && <p className="analysis-narrative__compact-line"><strong>Silna strona:</strong> {narrative.strengths[0]}</p>}
    {compact && narrative.risks[0] && <p className="analysis-narrative__compact-line"><strong>Do sprawdzenia:</strong> {narrative.risks[0]}</p>}
    {narrative.hardFilterWarning && <p className="analysis-narrative__hard-filter"><strong>Hard Filter:</strong> {narrative.hardFilterWarning}</p>}
  </div>
}
export function AnalysisQuality({ analysis, detailed = false }: { analysis: JobAnalysis; detailed?: boolean }) {
  const scoring = analysis.scoring
  const coverage = scoring?.coverage
  const confidence = scoring?.criterionConfidence
  const limited = scoring?.reliability === 'limited'
  if (!scoring && !analysis.criteria) return <AnalysisNarrative analysis={analysis} compact />
  return <div className={`analysis-quality${detailed ? ' analysis-quality--detailed' : ''}`}>
    {!detailed && <AnalysisNarrative analysis={analysis} />}
    <p><strong>{limited ? `Wynik częściowy: ${analysis.overallScore}/100${typeof coverage === 'number' ? ` przy ${formatPercentage(coverage)} pokrycia` : ''}` : `${analysis.overallScore}/100`}</strong>{limited && <span className="analysis-quality__limited">Nie interpretuj jako pełnego dopasowania</span>}</p>
    <div className="analysis-quality__metrics"><span>Pokrycie: {typeof coverage === 'number' ? formatPercentage(coverage) : 'brak danych'}</span><span>Pewność: {typeof confidence === 'number' ? `${confidence}%` : 'brak danych'}</span><span>Wiarygodność: {scoring?.reliability === 'standard' ? 'standardowa' : scoring?.reliability === 'limited' ? 'ograniczona' : 'brak danych'}</span></div>
    {detailed && <div className="analysis-quality__criteria">{(['experience', 'skills', 'preferences', 'growth'] as AnalysisCategory[]).map((category) => {
      const items = criterionList(analysis, category)
      if (!items.length) return <div key={category}><strong>{categoryLabels[category]}</strong><p>Brak kryteriów szczegółowych w historycznej analizie.</p></div>
      return <div key={category}><strong>{categoryLabels[category]}</strong><ul>{items.map((criterion) => <li key={criterion.id}><b>{criterion.requirement}</b> — {criterionOutcomeLabel(criterion.outcome)}{criterionMatchTypeLabel(criterion.matchType) ? ` · ${criterionMatchTypeLabel(criterion.matchType)}` : ''}; pewność {criterion.confidence}%<br /><span>{criterion.rationale}</span><br />{criterion.outcome === 'UNKNOWN' ? <em>Brak potwierdzających danych.</em> : <><small>Profil: {criterion.profileEvidence.join('; ') || 'brak dowodu'}</small><br /><small>Oferta: {criterion.offerEvidence.join('; ') || 'brak dowodu'}</small></>}</li>)}</ul></div>
    })}</div>}
  </div>
}
export function Alert({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'success' | 'warning' }) { return <div className={`alert alert--${tone}`} role="status"><strong>{title}</strong><span>{children}</span></div> }
export function SectionCard({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) { return <section className={`surface-card ${className}`}>{title && <h2>{title}</h2>}{children}</section> }

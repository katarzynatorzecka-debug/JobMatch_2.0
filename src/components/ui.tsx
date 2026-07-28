import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { statusMeta, type DemoOffer, type DemoStatus } from '../demo/offers'

export function PageHeader({ eyebrow = 'JobMatch', title, intro, actions }: { eyebrow?: string; title: string; intro: string; actions?: ReactNode }) { return <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-intro">{intro}</p>{actions}</header> }
export function PrimaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button--primary ${className}`} {...props}>{children}</button> }
export function SecondaryButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button className={`button button--secondary ${className}`} {...props}>{children}</button> }
export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="button button--primary" to={to}>{children}</Link> }
export function SecondaryLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="button button--secondary" to={to}>{children}</Link> }
export function StatusBadge({ status }: { status: DemoStatus }) { const meta = statusMeta[status]; return <span className={`status-badge status-badge--${status}`}><span aria-hidden="true">{meta.symbol}</span>{meta.label}</span> }
export function ScoreBadge({ score }: { score: number }) { return <span className="score-badge" aria-label={`Ocena dopasowania: ${score} na 100`}><strong>{score}</strong><span>/100</span></span> }
export function SourceBadge({ state }: { state: DemoOffer['sourceState'] }) { return <span className="source-badge"><span aria-hidden="true">▣</span>{state === 'fallback' ? 'Użyto danych zapasowych' : 'Analiza na podstawie częściowych danych'}</span> }
export function CategoryScore({ label, score }: { label: string; score: number }) { return <div className="category-score"><div><span>{label}</span><strong>{score}/100</strong></div><div className="progress-track" aria-label={`${label}: ${score} na 100`}><span style={{ width: `${score}%` }} /></div></div> }
export function Alert({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'success' | 'warning' }) { return <div className={`alert alert--${tone}`} role="status"><strong>{title}</strong><span>{children}</span></div> }
export function SectionCard({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) { return <section className={`surface-card ${className}`}>{title && <h2>{title}</h2>}{children}</section> }

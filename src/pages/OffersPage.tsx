import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FilteredJobOffer, HardFilterStatus } from '../contracts/hardFilter'
import type { JobAnalysis } from '../contracts/jobAnalysis'
import { Alert, HardFilterStatusBadge, PageHeader, PrimaryLink, ScoreBadge } from '../components/ui'
import { useAppMode } from '../features/access/AppModeProvider'
import { localAnalysisRepository, supabaseAnalysisRepository } from '../features/analysis/analysisRepository'
import { loadHardFilterSession } from '../features/hardFilter/hardFilterSessionStorage'
import { offerMeta, primaryReason, sortFilteredOffers } from '../features/offers/offerResultsAdapter'

type Filter = 'all' | HardFilterStatus
function ImportedOfferCard({ item, analysis }: { item: FilteredJobOffer; analysis?: JobAnalysis }) {
  const { offer, result } = item
  return <article className="offer-card"><div className="offer-card__header"><div><h2>{offer.title}</h2><p>{offer.company}</p></div>{analysis ? <ScoreBadge score={analysis.overallScore} /> : <HardFilterStatusBadge status={result.status} />}</div><div className="offer-card__meta"><HardFilterStatusBadge status={result.status} /><span>Źródło: {analysis?.sourceQuality === 'full' ? 'pełna treść lokalna' : 'dane częściowe'}</span>{offerMeta(item).map((value) => <span key={value}>{value}</span>)}</div>{analysis ? <><p className="recommendation"><strong>{analysis.recommendation}.</strong> {analysis.summary}</p>{analysis.risks[0] && <p className="risk-summary"><strong>Najważniejsze ryzyko:</strong> {analysis.risks[0]}</p>}</> : <p className="risk-summary"><strong>Hard Filter:</strong> {primaryReason(item)}</p>}<Link className="text-link" to={`/offers/${offer.id}`}>Zobacz szczegóły <span aria-hidden="true">→</span></Link></article>
}

export function OffersPage() {
  const { mode, session } = useAppMode()
  const sessionResult = loadHardFilterSession()
  const [filter, setFilter] = useState<Filter>('all')
  const [analyses, setAnalyses] = useState<JobAnalysis[]>([])
  const imported = useMemo(() => sortFilteredOffers(sessionResult.session?.filteredOffers ?? []), [sessionResult.session])
  useEffect(() => { const repository = mode === 'authenticated' && session ? supabaseAnalysisRepository(session.user) : localAnalysisRepository; void repository.load().then(setAnalyses) }, [mode, session])
  const visible = imported.filter((item) => filter === 'all' || item.result.status === filter)
  const analysisByOffer = new Map(analyses.map((analysis) => [analysis.offerId, analysis]))
  const sorted = [...visible].sort((left, right) => { const leftScore = analysisByOffer.get(left.offer.id)?.overallScore ?? -1; const rightScore = analysisByOffer.get(right.offer.id)?.overallScore ?? -1; return left.result.status === 'fail' ? 1 : right.result.status === 'fail' ? -1 : rightScore - leftScore })
  if (!imported.length) return <section className="page page--wide"><PageHeader eyebrow="Wyniki ofert" title="Brak wyników Hard Filter" intro="Zaimportuj raport i uruchom analizę, aby zobaczyć oferty." /><div className="action-row"><PrimaryLink to="/import">Przejdź do importu</PrimaryLink></div></section>
  return <section className="page page--wide"><PageHeader eyebrow="Wyniki ofert" title="Oferty do sprawdzenia" intro={`Wyniki AI są wskazówką, nie obiektywną prawdą. ${analyses.length} z ${imported.length} ofert ma gotową analizę.`} />{sessionResult.warning && <Alert title="Uwaga dotycząca wyniku" tone="warning">{sessionResult.warning}</Alert>}<div className="list-controls"><label>Status<select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">Wszystkie</option><option value="pass">Przechodzi</option><option value="weak">Wymaga sprawdzenia</option><option value="fail">Odrzucona</option></select></label></div><section className="offer-section"><div className="offer-list">{sorted.map((item) => <ImportedOfferCard key={item.offer.id} item={item} analysis={analysisByOffer.get(item.offer.id)} />)}</div></section></section>
}

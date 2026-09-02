import { describe, expect, it } from 'vitest'
import offersSource from './OffersPage.tsx?raw'
import detailsSource from './OfferDetailsPage.tsx?raw'
import importSource from './ImportAnalysisPage.tsx?raw'

describe('analysis replay UI', () => {
  it('keeps a current result from silently becoming a force reanalysis', () => {
    expect(offersSource).toContain('analysisReplayAction')
    expect(detailsSource).toContain('analysisReplayAction')
    expect(offersSource).not.toContain('forceReanalysis ? { forceReanalysis } : undefined')
    expect(detailsSource).not.toContain('forceReanalysis ? { forceReanalysis } : undefined')
    expect(offersSource).toContain("disabled={action === 'current' || action === 'in_progress'}")
    expect(detailsSource).toContain("disabled={replayAction === 'current' || replayAction === 'in_progress'}")
  })

  it('keeps the offer list visible while an active analysis is refreshed in the background', () => {
    expect(offersSource).toContain('const [initialLoading, setInitialLoading]')
    expect(offersSource).toContain('const hasLoaded = useRef(false)')
    expect(offersSource).toContain('const initial = !hasLoaded.current')
    expect(offersSource).toContain("item.analysisState.queueItem?.status === 'queued' || item.analysisState.queueItem?.status === 'processing'")
    expect(offersSource).toContain('if (initialLoading) return')
    expect(offersSource).toContain('aria-busy={refreshing || undefined}')
  })

  it('shows quality-aware scores without duplicating summary and risks on import or details', () => {
    expect(offersSource).toContain("limited={item.analysis.scoring?.reliability === 'limited'}")
    expect(importSource).toContain('<AnalysisQuality analysis={analysis} />')
    expect(importSource).not.toContain('scoreBand(analysis.overallScore)')
    expect(importSource).not.toContain('analysis.risks[0]')
    expect(detailsSource).toContain('<AnalysisQuality analysis={analysis} />')
    expect(detailsSource).not.toContain('{analysis.recommendation}</strong> — {analysis.summary}')
    expect(detailsSource).toContain('Wynik częściowy: ${entry.analysis.overallScore}/100')
  })
})

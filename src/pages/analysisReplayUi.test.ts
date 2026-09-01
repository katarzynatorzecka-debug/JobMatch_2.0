import { describe, expect, it } from 'vitest'
import offersSource from './OffersPage.tsx?raw'
import detailsSource from './OfferDetailsPage.tsx?raw'

describe('analysis replay UI', () => {
  it('keeps a current result from silently becoming a force reanalysis', () => {
    expect(offersSource).toContain('analysisReplayAction')
    expect(detailsSource).toContain('analysisReplayAction')
    expect(offersSource).not.toContain('forceReanalysis ? { forceReanalysis } : undefined')
    expect(detailsSource).not.toContain('forceReanalysis ? { forceReanalysis } : undefined')
    expect(offersSource).toContain("disabled={action === 'current' || action === 'in_progress'}")
    expect(detailsSource).toContain("disabled={replayAction === 'current' || replayAction === 'in_progress'}")
  })
})

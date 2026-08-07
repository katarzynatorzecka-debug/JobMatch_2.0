import { describe, expect, it } from 'vitest'
import { messageRouteForOffer } from './messageNavigation'

describe('message navigation', () => {
  it('builds the canonical generator route from offer id', () => {
    expect(messageRouteForOffer('offer-123')).toBe('/offers/offer-123/message')
    expect(messageRouteForOffer('offer with spaces')).toBe('/offers/offer%20with%20spaces/message')
  })
})
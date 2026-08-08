import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { OnboardingStart } from './StartPage'

describe('Start onboarding state', () => {
  it('keeps CV and manual profile CTAs', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><OnboardingStart /></MemoryRouter>)
    expect(markup).toContain('/profile?mode=cv')
    expect(markup).toContain('/profile?mode=manual')
    expect(markup).toContain('Dodaj CV i utwórz profil')
    expect(markup).toContain('Uzupełnij profil ręcznie')
    expect(markup).not.toContain('Analizuj ofertę')
  })
})
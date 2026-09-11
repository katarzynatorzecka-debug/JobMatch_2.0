import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { OnboardingStart } from './StartPage'
import { I18nProvider } from '../i18n/I18nProvider'

const renderStart = (locale: 'pl' | 'en' = 'pl') => renderToStaticMarkup(<I18nProvider initialLocale={locale}><MemoryRouter><OnboardingStart /></MemoryRouter></I18nProvider>)

describe('Start onboarding state', () => {
  it('keeps CV and manual profile CTAs', () => {
    const markup = renderStart()
    expect(markup).toContain('/profile?mode=cv')
    expect(markup).toContain('/profile?mode=manual')
    expect(markup).toContain('Dodaj CV i utwórz profil')
    expect(markup).toContain('Uzupełnij profil ręcznie')
    expect(markup).not.toContain('Analizuj ofertę')
  })

  it('renders English onboarding labels when English is selected', () => {
    const markup = renderStart('en')
    expect(markup).toContain('Add CV and create profile')
    expect(markup).toContain('Complete profile manually')
    expect(markup).not.toContain('Dodaj CV i utwórz profil')
  })
})

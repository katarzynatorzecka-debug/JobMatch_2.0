import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../i18n/I18nProvider'
import { LanguageToggle } from './LanguageToggle'

describe('LanguageToggle', () => {
  it('renders Polish as the default active locale', () => {
    const markup = renderToStaticMarkup(<I18nProvider><LanguageToggle /></I18nProvider>)

    expect(markup).toContain('aria-label="Wybór języka"')
    expect(markup).toMatch(/aria-label="Aktualny język: polski"[^>]*aria-pressed="true"/)
    expect(markup).toMatch(/aria-label="Przełącz język na angielski"[^>]*aria-pressed="false"/)
    expect(markup).toContain('>PL</button>')
    expect(markup).toContain('>EN</button>')
  })
})

import { describe, expect, it } from 'vitest'
import { htmlToSafeText, MAX_EML_FILE_SIZE, validateEmlFile } from './importUtils'

describe('validateEmlFile', () => {
  it('accepts a non-empty EML under the limit', () => expect(validateEmlFile({ name: 'raport.eml', size: 400, type: 'message/rfc822' } as File)).toEqual({ valid: true }))
  it('rejects format, empty file and size over the limit', () => {
    expect(validateEmlFile({ name: 'raport.pdf', size: 1, type: 'application/pdf' } as File).valid).toBe(false)
    expect(validateEmlFile({ name: 'raport.eml', size: 0, type: 'message/rfc822' } as File).valid).toBe(false)
    expect(validateEmlFile({ name: 'raport.eml', size: MAX_EML_FILE_SIZE + 1, type: 'message/rfc822' } as File).valid).toBe(false)
  })
})

describe('htmlToSafeText', () => {
  it('keeps text and links without executing or retaining scripts', () => {
    const output = htmlToSafeText('<p>Oferta</p><script>window.injected = true</script><a href="https://rocketjobs.pl/oferta-pracy/test">Zobacz</a>')
    expect(output).toContain('Oferta')
    expect(output).toContain('https://rocketjobs.pl/oferta-pracy/test')
    expect(output).not.toContain('window.injected')
  })
})

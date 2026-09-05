import { describe, expect, it } from 'vitest'
import { extractRfc822Content } from './emlExtractor'

const bytes = (value: string) => new TextEncoder().encode(value).buffer

describe('RFC822 extraction', () => {
  it.each([
    ['text-only', 'Content-Type: text/plain; charset=UTF-8\r\n\r\nExample Labs\nWarszawa\nData Analyst\nhttps://rocketjobs.pl/oferta-pracy/example-data'],
    ['html-only', 'Content-Type: text/html; charset=UTF-8\r\n\r\n<html><body><div>Example Labs</div><div>Warszawa</div><div>Data Analyst</div><a href="https://rocketjobs.pl/oferta-pracy/example-data">Oferta</a></body></html>'],
    ['multipart', 'MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="alt"\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nExample Labs\nWarszawa\nData Analyst\nhttps://rocketjobs.pl/oferta-pracy/example-data\r\n--alt\r\nContent-Type: text/html\r\n\r\n<p>HTML fallback</p>\r\n--alt--'],
  ])('extracts an inert report body from %s mail', async (_kind, message) => {
    const result = await extractRfc822Content(bytes(message))
    expect(result.success).toBe(true)
    expect(result.text).toContain('Data Analyst')
  })

  it('ignores attachment content and rejects empty or oversized input', async () => {
    const message = 'MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="mixed"\r\n\r\n--mixed\r\nContent-Type: text/plain\r\n\r\nExample Labs\nWarszawa\nData Analyst\nhttps://rocketjobs.pl/oferta-pracy/example-data\r\n--mixed\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="private.txt"\r\nContent-Transfer-Encoding: base64\r\n\r\nU0VDUkVUX0FUVEFDSE1FTlQ=\r\n--mixed--'
    const result = await extractRfc822Content(bytes(message))
    expect(result.success).toBe(true)
    expect(result.text).not.toContain('SECRET_ATTACHMENT')
    expect((await extractRfc822Content(new ArrayBuffer(0))).success).toBe(false)
    expect((await extractRfc822Content(bytes('1234'), 3)).error).toContain('zbyt duża')
  })
})

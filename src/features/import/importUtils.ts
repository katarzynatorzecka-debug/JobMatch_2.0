export const MAX_EML_FILE_SIZE = 10 * 1024 * 1024

export type FileDescriptor = Pick<File, 'name' | 'size' | 'type'>

export function validateEmlFile(file: FileDescriptor | null | undefined) {
  if (!file) return { valid: false as const, error: 'Wybierz plik raportu.' }
  if (!file.name.toLocaleLowerCase().endsWith('.eml')) return { valid: false as const, error: 'Wybierz plik w formacie .eml.' }
  if (file.type && !['message/rfc822', 'application/octet-stream', 'text/plain'].includes(file.type)) return { valid: false as const, error: 'Ten typ pliku nie wygląda jak wiadomość EML.' }
  if (file.size === 0) return { valid: false as const, error: 'Wybrany plik jest pusty.' }
  if (file.size > MAX_EML_FILE_SIZE) return { valid: false as const, error: 'Plik jest zbyt duży. Maksymalny rozmiar to 10 MB.' }
  return { valid: true as const }
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** Turns email HTML into inert text; it never inserts the markup into the live document. */
export function htmlToSafeText(html: string) {
  if (typeof DOMParser === 'undefined') {
    const withLinks = html.replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    return normalizeWhitespace(withLinks.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '))
  }
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script, style, iframe, object, embed, svg').forEach((node) => node.remove())
  document.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')?.trim()
    if (href && /^https?:\/\//i.test(href) && !anchor.textContent?.includes(href)) anchor.append(` (${href})`)
  })
  document.querySelectorAll('br, p, li, tr, div, h1, h2, h3, h4').forEach((node) => node.append('\n'))
  return normalizeWhitespace(document.body.textContent ?? '')
}

export function stableOfferId(title: string, company: string, sourceUrl?: string) {
  const value = (sourceUrl || `${title}|${company}`).toLocaleLowerCase().trim()
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `offer-${(hash >>> 0).toString(36)}`
}

export function normalizedKey(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

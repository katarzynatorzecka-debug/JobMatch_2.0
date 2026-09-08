export function normalizeRocketJobsSourceUrl(sourceUrl: string) {
  const value = sourceUrl.trim().replace(/[),.;]+$/g, '')
  try {
    const url = new URL(value)
    if (!['rocketjobs.pl', 'www.rocketjobs.pl'].includes(url.hostname.toLocaleLowerCase())) return value
    if (url.pathname.startsWith('/oferta/')) {
      const legacyPath = url.pathname
      url.pathname = `/oferta-pracy/${legacyPath.slice('/oferta/'.length)}`
    }
    if (url.search.includes('?')) url.search = `?${url.search.slice(1).replace(/\?/g, '&')}`
    return url.toString()
  } catch {
    return value
  }
}

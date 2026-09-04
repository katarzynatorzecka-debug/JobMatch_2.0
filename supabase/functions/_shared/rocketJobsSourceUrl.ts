const knownLocationSlugs = ['warszawa', 'poznan', 'wroclaw', 'gdansk', 'krakow', 'lodz', 'kielce', 'radom', 'bydgoszcz', 'lublin', 'katowice', 'szczecin', 'rzeszow', 'torun', 'bialystok', 'czestochowa']

function slug(value: string) {
  return value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-')
}

export function normalizeRocketJobsSourceUrl(sourceUrl: string, location?: string) {
  const value = sourceUrl.trim().replace(/[),.;]+$/g, '')
  try {
    const url = new URL(value)
    if (!['rocketjobs.pl', 'www.rocketjobs.pl'].includes(url.hostname.toLocaleLowerCase())) return value
    if (url.pathname.startsWith('/oferta/')) {
      const legacyPath = url.pathname
      url.pathname = `/oferta-pracy/${legacyPath.slice('/oferta/'.length)}`
      const locationSlug = typeof location === 'string' ? slug(location.split(',')[0] ?? '') : ''
      if (knownLocationSlugs.includes(locationSlug)) {
        for (const oldLocationSlug of knownLocationSlugs) {
          if (oldLocationSlug !== locationSlug) url.pathname = url.pathname.replace(`-${oldLocationSlug}-`, `-${locationSlug}-`)
        }
      }
    }
    if (url.search.includes('?')) url.search = `?${url.search.slice(1).replace(/\?/g, '&')}`
    return url.toString()
  } catch {
    return value
  }
}

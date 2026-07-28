import type { ImportedJobOffer, ImportWarning } from '../../contracts/import'
import { htmlToSafeText, normalizedKey, normalizeWhitespace, stableOfferId } from './importUtils'

const sourceUrlPattern = /https?:\/\/(?:www\.)?rocketjobs\.pl\/oferta(?:-pracy)?\/[^\s)>]+/gi
const ignoredLines = /^(zobacz ofertę|aplikuj|sprawdź ofertę|rocketjobs|więcej ofert|job alert|unsubscribe|wypisz|poznaj szczegóły)$/i
const metaLine = /^(lokalizacja|miejsce pracy|tryb pracy|forma pracy|rodzaj umowy|umowa|wynagrodzenie|widełki|firma|company|stanowisko|oferta|salary)\s*:/i

type Candidate = { offer: ImportedJobOffer; key: string }

function cleanLine(line: string) {
  return line.replace(/\s*\(https?:\/\/[^)]+\)\s*/gi, '').replace(/^[-–—•·]\s*/, '').trim()
}

function field(block: string, labels: string[]) {
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const found = block.match(new RegExp(`(?:^|\\n)(?:${label})\\s*:\\s*([^\\n]+)`, 'i'))
  return found?.[1] ? cleanLine(found[1]) : undefined
}

function firstUsefulLines(block: string) {
  return block.split('\n').map(cleanLine).filter((line) => line.length >= 2 && line.length <= 180 && !ignoredLines.test(line) && !metaLine.test(line) && !/^https?:\/\//i.test(line) && !/^\[image:/i.test(line))
}

function offerFromBlock(block: string, sourceUrl: string): ImportedJobOffer | null {
  const title = field(block, ['stanowisko', 'oferta', 'job title', 'position'])
  const company = field(block, ['firma', 'company', 'pracodawca'])
  const useful = firstUsefulLines(block)
  const elapsedIndex = useful.findIndex((line) => /^(pozostało|dodano|wygasa|opublikowano)\b/i.test(line))
  const cardLines = elapsedIndex >= 5 ? useful.slice(Math.max(0, elapsedIndex - 7), elapsedIndex) : useful
  // The two RocketJobs report layouts use company → location → title in their compact card.
  const resolvedCompany = company || cardLines[0] || useful[0]
  const resolvedTitle = title || cardLines[2] || useful.find((line, index) => index > 0 && line !== resolvedCompany && !/(zdaln|hybryd|b2b|umowa|pln|zł|kraków|warszaw|gdańsk|wrocław|poznań|łódź)/i.test(line))
  if (!resolvedTitle || !resolvedCompany) return null
  const location = field(block, ['lokalizacja', 'miejsce pracy', 'location']) || cardLines[1] || useful.find((line) => /(kraków|warszaw|gdańsk|wrocław|poznań|łódź|zdaln|remote|hybryd)/i.test(line))
  const workMode = field(block, ['tryb pracy', 'forma pracy', 'work mode']) || cardLines.find((line) => /(zdaln|remote|hybryd|stacjon)/i.test(line))
  const contractType = field(block, ['rodzaj umowy', 'umowa', 'contract']) || cardLines.find((line) => /(b2b|umowa o pracę|uop|zlecenie|freelance|kontrakt)/i.test(line))
  const salary = field(block, ['wynagrodzenie', 'widełki', 'salary']) || cardLines.find((line) => /(pln|zł|eur|usd|netto|brutto)\b/i.test(line))
  const optionalFields: Array<[string, string | undefined]> = [['lokalizacja', location], ['tryb pracy', workMode], ['forma współpracy', contractType], ['wynagrodzenie', salary]]
  const missingFields = optionalFields.filter(([, value]) => !value).map(([name]) => name)
  const warning = missingFields.length ? `Brak danych: ${missingFields.join(', ')}.` : undefined
  return {
    id: stableOfferId(resolvedTitle, resolvedCompany, sourceUrl), title: resolvedTitle, company: resolvedCompany,
    location, workMode, contractType, salary, sourceUrl, sourceLabel: 'RocketJobs', missingFields, warnings: warning ? [warning] : [],
  }
}

export function parseRocketJobsReport(input: string) {
  const text = normalizeWhitespace(/<(?:html|body|table|div|a\b|p\b)/i.test(input) ? htmlToSafeText(input) : input)
  const matches = [...text.matchAll(sourceUrlPattern)]
  const warnings: ImportWarning[] = []
  const candidates: Candidate[] = matches.map((match, index) => {
    const previousEnd = index === 0 ? Math.max(0, match.index! - 1300) : matches[index - 1].index! + matches[index - 1][0].length
    const block = text.slice(previousEnd, match.index).trim()
    const offer = offerFromBlock(block, match[0])
    return offer ? { offer, key: normalizedKey(match[0]) } : null
  }).filter((value): value is Candidate => value !== null)

  const offers: ImportedJobOffer[] = []
  const seen = new Set<string>()
  candidates.forEach(({ offer, key }) => {
    const fallbackKey = `${normalizedKey(offer.company)}|${normalizedKey(offer.title)}`
    if (seen.has(key) || seen.has(fallbackKey)) {
      warnings.push({ code: 'duplicate', message: `Pominięto zduplikowaną ofertę: ${offer.title}.`, offerId: offer.id })
      return
    }
    seen.add(key); seen.add(fallbackKey); offers.push(offer)
  })
  if (matches.length && !offers.length) warnings.push({ code: 'unsupported-layout', message: 'Rozpoznano linki RocketJobs, ale układ raportu nie zawierał kompletnych tytułów i firm.' })
  return { offers, warnings }
}

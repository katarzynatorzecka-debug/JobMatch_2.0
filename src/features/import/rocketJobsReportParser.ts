import type { ImportedJobOffer, ImportWarning } from '../../contracts/import'
import { htmlToSafeText, normalizedKey, normalizeWhitespace, stableOfferId } from './importUtils'
import { normalizeRocketJobsSourceUrl } from '../../../supabase/functions/_shared/rocketJobsSourceUrl'

const sourceUrlPattern = /https?:\/\/(?:www\.)?rocketjobs\.pl\/oferta(?:-pracy)?\/[^\s)>]+/gi
const ignoredLines = /^(zobacz ofertę|aplikuj|sprawdź ofertę|rocketjobs|więcej ofert|job alert|unsubscribe|wypisz|poznaj szczegóły)$/i
const metaLine = /^(lokalizacja|miejsce pracy|tryb pracy|forma pracy|rodzaj umowy|umowa|wynagrodzenie|widełki|firma|company|stanowisko|oferta|salary)\s*:/i
const newsletterChromeLine = /(twoje preferencje|najlepiej dopasowane|mamy dla ciebie nowe oferty)/i
const cityLine = /(białystok|bielsko-biała|bydgoszcz|bytom|częstochowa|gdańsk|gdynia|gliwice|gorzów|grudziądz|katowice|kielce|koszalin|kraków|legnica|lublin|łódź|olsztyn|opole|płock|poznań|radom|rzeszów|rybnik|sosnowiec|szczecin|tarnów|toruń|tychy|warszawa|włocławek|wrocław|zabrze|zielona góra)/i
const unavailableSalaryLine = /^(brak\s+)?(widełek|widelek)(\s+wynagrodzenia)?$|^brak\s+(widełek|widelek|wynagrodzenia|stawek)(\s+wynagrodzenia)?$/i

type Candidate = { offer: ImportedJobOffer; key: string }

function cleanLine(line: string) {
  return line.replace(/\s*\(https?:\/\/[^)]+\)\s*/gi, '').replace(/^[-–—•·]\s*/, '').replace(/^\d+\s*(?:[·•]\s*)?rocketjobs(?:\s*[·•]\s*)?/i, '').trim()
}

function field(block: string, labels: string[]) {
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const found = block.match(new RegExp(`(?:^|\\n)(?:${label})\\s*:\\s*([^\\n]+)`, 'i'))
  return found?.[1] ? cleanLine(found[1]) : undefined
}

function firstUsefulLines(block: string) {
  return block.split('\n').map(cleanLine).filter((line) => line.length >= 2 && line.length <= 180 && !ignoredLines.test(line) && !newsletterChromeLine.test(line) && !metaLine.test(line) && !/^https?:\/\//i.test(line) && !/^\[image:/i.test(line))
}

function isLocationLine(line: string) {
  return cityLine.test(line) || /\b(zdaln|remote|hybryd|stacjon|onsite)/i.test(line)
}

function isWorkModeLine(line: string) {
  return /\b(zdaln|remote|hybryd|stacjon|onsite)/i.test(line)
}

function isContractLine(line: string) {
  return /\b(b2b|umowa o pracę|uop|zlecenie|freelance|kontrakt)/i.test(line)
}

function isSalaryLine(line: string) {
  return unavailableSalaryLine.test(line) || /(pln|zł|eur|usd|netto|brutto)\b/i.test(line)
}

function isElapsedLine(line: string) {
  return /^(pozosta[lł]o|dodano|wygasa|opublikowano)\b/i.test(line)
}

function isOfferMetadataLine(line: string) {
  return isLocationLine(line) || isWorkModeLine(line) || isContractLine(line) || isSalaryLine(line) || isElapsedLine(line)
}

function hasCompactOfferCard(useful: string[], elapsedIndex: number) {
  if (elapsedIndex >= 2 && useful.slice(Math.max(0, elapsedIndex - 4), elapsedIndex).length >= 2) return true
  return useful.length >= 3 && useful.some((line) => /(zdaln|remote|hybryd|stacjon|b2b|umowa o pracę|uop|zlecenie|freelance|kontrakt|pln|zł|eur|usd|kraków|warszaw|gdańsk|wrocław|poznań|łódź)/i.test(line))
}

function offerFromBlock(block: string, sourceUrl: string): ImportedJobOffer | null {
  const title = field(block, ['stanowisko', 'oferta', 'job title', 'position'])
  const company = field(block, ['firma', 'company', 'pracodawca'])
  const useful = firstUsefulLines(block)
  const elapsedIndex = useful.findIndex(isElapsedLine)
  if (!(title && company) && !hasCompactOfferCard(useful, elapsedIndex)) return null
  // The two RocketJobs report layouts use company → location → title in their compact card.
  const resolvedCompany = company || useful.find((line) => !isOfferMetadataLine(line))
  const companyIndex = resolvedCompany ? useful.indexOf(resolvedCompany) : -1
  const nextLine = useful[companyIndex + 1]
  const positionalLocation = nextLine && !isOfferMetadataLine(nextLine) && useful.some((line, index) => index > companyIndex + 1 && !isOfferMetadataLine(line)) ? nextLine : undefined
  const resolvedTitle = title || useful.find((line, index) => index > companyIndex && line !== positionalLocation && line !== resolvedCompany && !isOfferMetadataLine(line))
  if (!resolvedTitle || !resolvedCompany) return null
  const location = field(block, ['lokalizacja', 'miejsce pracy', 'location']) || positionalLocation || useful.find(isLocationLine)
  const workMode = field(block, ['tryb pracy', 'forma pracy', 'work mode']) || useful.find(isWorkModeLine)
  const contractType = field(block, ['rodzaj umowy', 'umowa', 'contract']) || useful.find(isContractLine)
  const salary = field(block, ['wynagrodzenie', 'widełki', 'salary']) || useful.find((line) => !unavailableSalaryLine.test(line) && isSalaryLine(line))
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
    const initialSourceUrl = normalizeRocketJobsSourceUrl(match[0])
    const initialOffer = offerFromBlock(block, initialSourceUrl)
    if (!initialOffer) return null
    const sourceUrl = normalizeRocketJobsSourceUrl(match[0], initialOffer.location)
    const offer = sourceUrl === initialSourceUrl ? initialOffer : offerFromBlock(block, sourceUrl)
    return offer ? { offer, key: normalizedKey(sourceUrl) } : null
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

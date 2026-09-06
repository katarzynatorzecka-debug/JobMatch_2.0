import PostalMime from 'postal-mime'
import { normalizeRocketJobsSourceUrl } from '../rocketJobsSourceUrl.ts'
import { GMAIL_MAX_MESSAGE_BYTES, GMAIL_ROCKETJOBS_DEFAULT_SENDER, type ImportedJobOffer, type ImportWarning } from './contracts.ts'
import { GmailEdgeError } from './errors.ts'

const sourceUrlPattern = /https?:\/\/(?:www\.)?rocketjobs\.pl\/oferta(?:-pracy)?\/[^\s)>]+/gi
const ignoredLines = /^(zobacz ofertę|aplikuj|sprawdź ofertę|rocketjobs|więcej ofert|job alert|unsubscribe|wypisz|poznaj szczegóły)$/i
const metaLine = /^(lokalizacja|miejsce pracy|tryb pracy|forma pracy|rodzaj umowy|umowa|wynagrodzenie|widełki|firma|company|stanowisko|oferta|salary)\s*:/i
const newsletterChromeLine = /(twoje preferencje|najlepiej dopasowane|mamy dla ciebie nowe oferty)/i

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function htmlToSafeText(html: string) {
  const withLinks = html.replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
  return normalizeWhitespace(withLinks.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-4])\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
}

function normalizedKey(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function stableOfferId(title: string, company: string, sourceUrl?: string) {
  const value = (sourceUrl || `${title}|${company}`).toLocaleLowerCase().trim()
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `offer-${(hash >>> 0).toString(36)}`
}

function cleanLine(line: string) {
  return line.replace(/\s*\(https?:\/\/[^)]+\)\s*/gi, '').replace(/^[-–—•·]\s*/, '').trim()
}

function field(block: string, labels: string[]) {
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const found = block.match(new RegExp(`(?:^|\\n)(?:${label})\\s*:\\s*([^\\n]+)`, 'i'))
  return found?.[1] ? cleanLine(found[1]) : undefined
}

function firstUsefulLines(block: string) {
  return block.split('\n').map(cleanLine).filter((line) => line.length >= 2 && line.length <= 180 && !ignoredLines.test(line) && !newsletterChromeLine.test(line) && !metaLine.test(line) && !/^https?:\/\//i.test(line) && !/^\[image:/i.test(line))
}

function hasCompactOfferCard(useful: string[], elapsedIndex: number) {
  return elapsedIndex >= 2 && useful.slice(Math.max(0, elapsedIndex - 4), elapsedIndex).length >= 2
}

function offerFromBlock(block: string, sourceUrl: string): ImportedJobOffer | null {
  const title = field(block, ['stanowisko', 'oferta', 'job title', 'position'])
  const company = field(block, ['firma', 'company', 'pracodawca'])
  const useful = firstUsefulLines(block)
  const elapsedIndex = useful.findIndex((line) => /^(pozosta[lł]o|dodano|wygasa|opublikowano)\b/i.test(line))
  if (!(title && company) && !hasCompactOfferCard(useful, elapsedIndex)) return null
  const cardLines = elapsedIndex >= 5 ? useful.slice(Math.max(0, elapsedIndex - 7), elapsedIndex) : useful
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
  return { id: stableOfferId(resolvedTitle, resolvedCompany, sourceUrl), title: resolvedTitle, company: resolvedCompany, location, workMode, contractType, salary, sourceUrl, sourceLabel: 'RocketJobs', missingFields, warnings: warning ? [warning] : [] }
}

export function parseRocketJobsText(input: string) {
  const text = normalizeWhitespace(/<(?:html|body|table|div|a\b|p\b)/i.test(input) ? htmlToSafeText(input) : input)
  const matches = [...text.matchAll(sourceUrlPattern)]
  const warnings: ImportWarning[] = []
  const candidates = matches.map((match, index) => {
    const previousEnd = index === 0 ? Math.max(0, match.index! - 1300) : matches[index - 1].index! + matches[index - 1][0].length
    const block = text.slice(previousEnd, match.index).trim()
    const initialSourceUrl = normalizeRocketJobsSourceUrl(match[0])
    const initialOffer = offerFromBlock(block, initialSourceUrl)
    if (!initialOffer) return null
    const sourceUrl = normalizeRocketJobsSourceUrl(match[0], initialOffer.location)
    const offer = sourceUrl === initialSourceUrl ? initialOffer : offerFromBlock(block, sourceUrl)
    return offer ? { offer, key: normalizedKey(sourceUrl) } : null
  }).filter((value): value is { offer: ImportedJobOffer; key: string } => value !== null)
  const offers: ImportedJobOffer[] = []
  const seen = new Set<string>()
  for (const { offer, key } of candidates) {
    const fallbackKey = `${normalizedKey(offer.company)}|${normalizedKey(offer.title)}`
    if (seen.has(key) || seen.has(fallbackKey)) {
      warnings.push({ code: 'duplicate', message: `Pominięto zduplikowaną ofertę: ${offer.title}.`, offerId: offer.id })
      continue
    }
    seen.add(key)
    seen.add(fallbackKey)
    offers.push(offer)
  }
  if (matches.length && !offers.length) warnings.push({ code: 'unsupported-layout', message: 'Rozpoznano linki RocketJobs, ale układ raportu nie zawierał kompletnych tytułów i firm.' })
  return { offers, warnings }
}

function decodedByteLength(raw: string) {
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0
  return Math.floor((raw.length * 3) / 4) - padding
}

function decodeRaw(raw: string) {
  const compact = raw.trim()
  if (!compact || !/^[A-Za-z0-9_-]+={0,2}$/.test(compact)) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
  if (decodedByteLength(compact) > GMAIL_MAX_MESSAGE_BYTES) throw new GmailEdgeError('GMAIL_MESSAGE_TOO_LARGE', 413)
  try {
    const standard = compact.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='))
    if (binary.length > GMAIL_MAX_MESSAGE_BYTES) throw new GmailEdgeError('GMAIL_MESSAGE_TOO_LARGE', 413)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer
  } catch (error) {
    if (error instanceof GmailEdgeError) throw error
    throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
  }
}

function normalizedSender(message: Awaited<ReturnType<PostalMime['parse']>>) {
  const address = typeof message.from === 'string' ? message.from : message.from?.address
  return typeof address === 'string' ? address.trim().toLocaleLowerCase() : ''
}

export async function parseGmailRawReport(raw: string) {
  let message: Awaited<ReturnType<PostalMime['parse']>>
  try {
    message = await new PostalMime().parse(decodeRaw(raw))
  } catch (error) {
    if (error instanceof GmailEdgeError) throw error
    throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
  }
  if (normalizedSender(message) !== GMAIL_ROCKETJOBS_DEFAULT_SENDER) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
  const plainText = message.text ? normalizeWhitespace(message.text) : ''
  const htmlText = message.html ? htmlToSafeText(message.html) : ''
  const text = /rocketjobs\.pl\/oferta(?:-pracy)?\//i.test(plainText) ? plainText : (htmlText.length >= plainText.length * 0.45 ? htmlText : plainText)
  if (!text) throw new GmailEdgeError('GMAIL_MESSAGE_INVALID', 422)
  const parsed = parseRocketJobsText(text)
  if (!parsed.offers.length) throw new GmailEdgeError('GMAIL_REPORT_EMPTY', 422)
  return { ...parsed, extractionWarnings: htmlText ? [] : ['Użyto tekstowej wersji wiadomości.'] }
}

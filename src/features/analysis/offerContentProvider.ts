import type { ImportedJobOffer } from '../../contracts/import'
import type { OfferContent } from '../../contracts/jobAnalysis'
const modules = import.meta.glob('/private-data/rocketjobs/*_offer_*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const normalizeUrl = (value: string) => value.split('?')[0].replace(/\/$/, '').toLowerCase()
export class OfferContentProvider { find(offer: ImportedJobOffer): OfferContent { const url = offer.sourceUrl ? normalizeUrl(offer.sourceUrl) : ''; const match = Object.values(modules).find((text) => url && text.split(/\r?\n/).some((line) => line.startsWith('https://') && normalizeUrl(line) === url)) ?? Object.values(modules).find((text) => text.toLowerCase().includes(offer.title.toLowerCase()) && text.toLowerCase().includes(offer.company.toLowerCase())); return match ? { text: match, sourceQuality: 'full' } : { text: '', sourceQuality: 'partial' } } }

import seed from '../../public/lottery-results/documents.json'
import { indiaDate } from './result-data'

export type DrawDocument = { date: string; slot: string; officialUrl?: string; officialSource?: 'sikkim-6pm'; sambadUrl?: string }
const key = 'orbis.public-lottery-documents.v1'

function safePdf(value: unknown, official: boolean, slot = ''): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  try {
    const url = new URL(value)
    const officialHost = slot === '6pm' ? 'www.sikkimlotteries.com' : 'nagalandlotteries.com'
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && !url.port && /\.pdf$/i.test(url.pathname) && (official ? url.hostname === officialHost : url.hostname === 'sambad.com' || url.hostname.endsWith('.sambad.com'))
  } catch { return false }
}

export function parseDocuments(input: unknown, today = indiaDate()): DrawDocument[] {
  const feed = input as { schema?: unknown; documents?: unknown } | null
  if (feed?.schema !== 1 || !Array.isArray(feed.documents) || feed.documents.length > 90) throw new Error('INVALID_DOCUMENT_FEED')
  const seen = new Set<string>()
  return feed.documents.map((row: DrawDocument) => {
    if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !['1pm', '6pm', '8pm'].includes(row.slot)) throw new Error('INVALID_DOCUMENT_DRAW')
    const time = Date.parse(row.date + 'T00:00:00Z')
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== row.date || seen.has(row.date + row.slot)) throw new Error('INVALID_DOCUMENT_DATE')
    seen.add(row.date + row.slot)
    if ((row.officialUrl !== undefined && !safePdf(row.officialUrl, true, row.slot)) || (row.sambadUrl !== undefined && !safePdf(row.sambadUrl, false))) throw new Error('INVALID_DOCUMENT_URL')
    if (row.officialSource !== undefined && (row.officialSource !== 'sikkim-6pm' || row.slot !== '6pm' || row.officialUrl !== undefined)) throw new Error('INVALID_OFFICIAL_SOURCE')
    // Keep only public link metadata; never persist an unexpected provider dataset.
    return { date: row.date, slot: row.slot, officialUrl: row.officialUrl, officialSource: row.officialSource, sambadUrl: row.sambadUrl }
  }).filter(row => { const days = (Date.parse(today) - Date.parse(row.date)) / 86400000; return days >= 0 && days < 30 })
}

export function cachedDocuments(): DrawDocument[] {
  try { return parseDocuments(JSON.parse(localStorage.getItem(key) ?? JSON.stringify(seed))) }
  catch { return parseDocuments(seed) }
}

export async function refreshDocuments(signal: AbortSignal): Promise<DrawDocument[]> {
  const response = await fetch('https://raw.githubusercontent.com/orbisaideveloper/orbis-khata/main/public/lottery-results/documents.json', { signal, cache: 'no-store', credentials: 'omit', redirect: 'error' })
  if (!response.ok) throw new Error('DOCUMENT_DOWNLOAD_UNAVAILABLE')
  const body = await response.text()
  if (body.length > 100000) throw new Error('DOCUMENT_FEED_TOO_LARGE')
  const documents = parseDocuments(JSON.parse(body))
  try { localStorage.setItem(key, JSON.stringify({ schema: 1, documents })) } catch { /* Session-only when storage is unavailable. */ }
  return documents
}

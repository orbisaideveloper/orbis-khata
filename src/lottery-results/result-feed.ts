import sample from './sample-2026-11-20.json'
import { indiaDate } from './result-data'

export type PublishedResult = typeof sample
const key = 'orbis.public-lottery-results.v1'
export const feedUrl = 'https://raw.githubusercontent.com/orbisaideveloper/orbis-khata/main/public/lottery-results/feed.json'

function withinWindow(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(date + 'T00:00:00Z')
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false
  const days = (Date.parse(today) - parsed.getTime()) / 86400000
  return days >= 0 && days < 30
}

function validResult(value: unknown): value is PublishedResult {
  if (!value || typeof value !== 'object') return false
  const row = value as PublishedResult
  if (row.schema !== 1 || typeof row.date !== 'string' || !['1pm', '6pm', '8pm'].includes(row.slot) || !Number.isSafeInteger(row.draw) || row.draw < 1) return false
  if (row.verification !== 'manual-two-source-comparison' || typeof row.name !== 'string' || row.name.length > 120) return false
  if (!/^[a-f0-9]{64}$/.test(row.officialSha256) || !/^https:\/\/nagalandlotteries\.com\/old_results\/[A-Z]{2}\d{6}\.PDF$/.test(row.officialUrl)) return false
  if (!row.first || !/^\d{2}[A-L]$/.test(row.first.series) || !/^\d{5}$/.test(row.first.number) || row.consolation !== row.first.number) return false
  if (!Array.isArray(row.tiers) || row.tiers.length !== 4) return false
  return row.tiers.every((tier, index) => tier?.rank === index + 2 && Array.isArray(tier.numbers) && tier.numbers.length === (index === 3 ? 100 : 10) && new Set(tier.numbers).size === tier.numbers.length && tier.numbers.every(n => typeof n === 'string' && (index === 0 ? /^\d{5}$/ : /^\d{4}$/).test(n)))
}

export function parseFeed(input: unknown, today = indiaDate()): PublishedResult[] {
  if (!input || typeof input !== 'object') throw new Error('INVALID_RESULT_FEED')
  const feed = input as { schema?: unknown; results?: unknown }
  if (feed.schema !== 1 || !Array.isArray(feed.results) || feed.results.length > 90 || !feed.results.every(validResult)) throw new Error('INVALID_RESULT_FEED')
  const records = feed.results.filter(row => withinWindow(row.date, today))
  const identities = records.map(row => row.date + ':' + row.slot)
  if (new Set(identities).size !== identities.length) throw new Error('DUPLICATE_DRAW')
  return records.map(row => ({ ...row, tiers: row.tiers.map(tier => ({ ...tier, numbers: [...tier.numbers].sort((left, right) => left.localeCompare(right)) })) }))
}

export function cachedResults(today = indiaDate()): PublishedResult[] {
  try {
    const records = parseFeed(JSON.parse(localStorage.getItem(key) ?? JSON.stringify({ schema: 1, results: [sample] })), today)
    try { localStorage.setItem(key, JSON.stringify({ schema: 1, results: records })) } catch { /* Session-only if storage is full or blocked. */ }
    return records
  } catch { return [] }
}

export async function refreshResults(signal: AbortSignal): Promise<PublishedResult[]> {
  const response = await fetch(feedUrl, { signal, cache: 'no-store', credentials: 'omit', redirect: 'error' })
  if (!response.ok) throw new Error('RESULT_DOWNLOAD_UNAVAILABLE')
  const body = await response.text()
  if (body.length > 1_000_000) throw new Error('RESULT_FEED_TOO_LARGE')
  const records = parseFeed(JSON.parse(body))
  // One atomic storage replacement; a failed download never clears an existing cache.
  try { localStorage.setItem(key, JSON.stringify({ schema: 1, results: records })) } catch { /* Results remain visible for this session. */ }
  return records
}

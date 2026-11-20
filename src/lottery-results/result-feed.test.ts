import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import sample from './sample-2026-11-20.json'
import { cachedResults, parseFeed, refreshResults } from './result-feed'
const feed = () => ({ schema: 1, results: [structuredClone(sample)] })
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T12:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('retains exactly 30 Indian calendar dates and removes expired/future results', () => {
  expect(parseFeed(feed(), '2026-12-19')).toHaveLength(1)
  expect(parseFeed(feed(), '2026-12-20')).toHaveLength(0)
  expect(parseFeed(feed(), '2026-11-19')).toHaveLength(0)
})
it('rejects duplicate draws, unreviewed OCR, incorrect counts and malicious proof URLs', () => {
  const duplicate = feed(); duplicate.results.push(structuredClone(sample))
  expect(() => parseFeed(duplicate)).toThrow('DUPLICATE_DRAW')
  for (const mutate of [
    (r: typeof sample) => { r.verification = 'review-required' },
    (r: typeof sample) => { r.officialUrl = 'https://evil.example/MN201126.PDF' },
    (r: typeof sample) => { r.tiers[3].numbers.pop() },
    (r: typeof sample) => { r.tiers[3].numbers[0] = '22' },
  ]) { const value = feed(); mutate(value.results[0]); expect(() => parseFeed(value)).toThrow('INVALID_RESULT_FEED') }
})
it('caches a valid download and preserves it on network/validation failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(feed()) }))
  await refreshResults(new AbortController().signal)
  expect(cachedResults()).toHaveLength(1)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  await expect(refreshResults(new AbortController().signal)).rejects.toThrow('offline')
  expect(cachedResults()).toHaveLength(1)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '{"schema":0}' }))
  await expect(refreshResults(new AbortController().signal)).rejects.toThrow()
  expect(cachedResults()).toHaveLength(1)
})
it('handles a blocked/corrupt cache without touching any financial storage', () => {
  localStorage.setItem('orbis.public-lottery-results.v1', 'broken')
  localStorage.setItem('financial-sentinel', 'untouched')
  expect(cachedResults()).toEqual([])
  expect(localStorage.getItem('financial-sentinel')).toBe('untouched')
})

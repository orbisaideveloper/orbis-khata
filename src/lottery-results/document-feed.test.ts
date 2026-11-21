import { afterEach, expect, it, vi } from 'vitest'
import seed from '../../public/lottery-results/documents.json'
import { cachedDocuments, parseDocuments, refreshDocuments } from './document-feed'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); vi.useRealTimers() })
const record = { date: '2026-11-20', slot: '8pm', officialUrl: 'https://nagalandlotteries.com/old_results/EN201126.PDF', sambadUrl: 'https://sambad.com/api-files/draw.pdf' }

it('keeps only safe exact-draw link metadata in the thirty-day window', () => {
  expect(parseDocuments({ schema: 1, documents: [{ ...record, private: 'not copied' }] }, '2026-11-21')).toEqual([record])
  expect(parseDocuments({ schema: 1, documents: [record] }, '2026-12-20')).toEqual([])
  expect(parseDocuments({ schema: 1, documents: [record] }, '2026-11-19')).toEqual([])
})

it('rejects malformed feeds, dates, duplicates, unsafe URLs and source impersonation', () => {
  for (const input of [null, {}, { schema: 2, documents: [] }, { schema: 1, documents: Array(91).fill(record) }]) {
    expect(() => parseDocuments(input)).toThrow()
  }
  for (const change of [{ date: '2026-02-30' }, { date: 'bad' }, { slot: '9pm' }, { sambadUrl: 'http://sambad.com/x.pdf' }, { sambadUrl: 'https://sambad.com.evil.test/x.pdf' }, { sambadUrl: 'https://sambad.com/x.pdf?token=secret' }, { sambadUrl: 'https://user:pass@sambad.com/x.pdf' }, { sambadUrl: 'https://sambad.com:444/x.pdf' }, { sambadUrl: 'https://sambad.com/x.jpg' }, { sambadUrl: 'invalid' }, { officialUrl: 'https://sambad.com/x.pdf' }]) {
    expect(() => parseDocuments({ schema: 1, documents: [{ ...record, ...change }] })).toThrow()
  }
  expect(() => parseDocuments({ schema: 1, documents: [record, record] })).toThrow()
  expect(() => parseDocuments({ schema: 1, documents: [null] })).toThrow()
})

it('caches only validated metadata and preserves it on failed or malformed downloads', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T00:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ schema: 1, documents: [record] }))))
  await expect(refreshDocuments(new AbortController().signal)).resolves.toEqual([record])
  expect(cachedDocuments()).toEqual([record])
  vi.mocked(fetch).mockResolvedValueOnce(new Response('error', { status: 500 }))
  await expect(refreshDocuments(new AbortController().signal)).rejects.toThrow('DOCUMENT_DOWNLOAD_UNAVAILABLE')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('x'.repeat(100001)))
  await expect(refreshDocuments(new AbortController().signal)).rejects.toThrow('DOCUMENT_FEED_TOO_LARGE')
  vi.mocked(fetch).mockResolvedValueOnce(new Response('{}'))
  await expect(refreshDocuments(new AbortController().signal)).rejects.toThrow()
  expect(cachedDocuments()).toEqual([record])
  localStorage.setItem('orbis.public-lottery-documents.v1', 'bad')
  expect(cachedDocuments()).toEqual(parseDocuments(seed))
})

it('supports verified Sikkim archive forms only for the six PM draw and never mixes state sources', () => {
  const sikkim = { date: '2026-11-20', slot: '6pm', officialSource: 'sikkim-6pm' }
  expect(parseDocuments({ schema: 1, documents: [sikkim] }, '2026-11-21')).toEqual([sikkim])
  for (const row of [{ ...sikkim, slot: '1pm' }, { ...sikkim, officialSource: 'other' }, { ...sikkim, officialUrl: record.officialUrl }, { ...record, slot: '6pm' }, { ...record, officialUrl: 'https://www.sikkimlotteries.com/other.pdf' }]) expect(() => parseDocuments({ schema: 1, documents: [row] }, '2026-11-21')).toThrow()
})

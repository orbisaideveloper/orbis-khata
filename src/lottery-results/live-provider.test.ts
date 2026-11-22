import { afterEach, expect, it, vi } from 'vitest'
import { liveChannel } from './live-channel'
import { fetchLiveVideo, selectLiveVideo } from './live-provider'
afterEach(() => vi.useRealTimers())
const now = new Date('2026-11-22T07:32:00Z')
const row = { id: 'abcdefghijk', snippet: { channelId: liveChannel, title: 'DEAR 1 PM 22.11.2026', liveBroadcastContent: 'live' }, status: { embeddable: true, privacyStatus: 'public' }, liveStreamingDetails: { actualStartTime: '2026-11-22T07:31:00Z' } }
it('requires exact channel, date, slot, real start and an embeddable public broadcast', () => {
  expect(selectLiveVideo([row], '2026-11-22', '1pm', now)?.status).toBe('live')
  for (const snippet of [{ ...row.snippet, channelId: 'other' }, { ...row.snippet, title: 'DEAR 1 PM 21.11.2026' }, { ...row.snippet, title: 'DEAR 6 PM 22.11.2026' }, { ...row.snippet, liveBroadcastContent: 'none' }]) expect(selectLiveVideo([{ ...row, snippet }], '2026-11-22', '1pm', now)).toBeNull()
  expect(selectLiveVideo([{ ...row, status: { embeddable: false, privacyStatus: 'public' } }], '2026-11-22', '1pm', now)).toBeNull()
  expect(selectLiveVideo([{ ...row, liveStreamingDetails: { actualStartTime: '2026-11-22T12:31:00Z' } }], '2026-11-22', '1pm', new Date('2026-11-22T13:00:00Z'))).toBeNull()
  expect(selectLiveVideo([row, { ...row, id: 'bcdefghijkl' }], '2026-11-22', '1pm', now)).toBeNull()
})
it('separates scheduled, live and ended broadcasts without using publication time', () => {
  const upcoming = { ...row, snippet: { ...row.snippet, liveBroadcastContent: 'upcoming' }, liveStreamingDetails: { scheduledStartTime: '2026-11-22T07:30:00Z' } }
  expect(selectLiveVideo([upcoming], '2026-11-22', '1pm', now)?.status).toBe('upcoming')
  expect(selectLiveVideo([{ ...row, liveStreamingDetails: {} }], '2026-11-22', '1pm', now)).toBeNull()
  expect(selectLiveVideo([{ ...row, liveStreamingDetails: { ...row.liveStreamingDetails, actualEndTime: '2026-11-22T07:31:30Z' } }], '2026-11-22', '1pm', now)?.status).toBe('completed')
})
it('fetches public channel uploads and batched video details with a server header key', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-22T09:00:00Z'))
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUabcdefghijk' } } }] })).mockResolvedValueOnce(Response.json({ items: [{ contentDetails: { videoId: row.id } }] })).mockResolvedValueOnce(Response.json({ items: [row] }))
  await fetchLiveVideo('private-test-key', '2026-11-22', '1pm', fetcher)
  expect(fetcher).toHaveBeenCalledTimes(3)
  for (const [url, options] of fetcher.mock.calls) { expect(String(url)).not.toContain('private-test-key'); expect(options?.headers).toMatchObject({ 'x-goog-api-key': 'private-test-key' }) }
  await expect(fetchLiveVideo('', '2026-11-22', '1pm', fetcher)).rejects.toThrow('LIVE_NOT_CONFIGURED')
  await expect(fetchLiveVideo('key', '2026-11-22', '1pm', vi.fn(async () => new Response('', { status: 403 })))).rejects.toThrow('LIVE_PROVIDER_LIMIT')
})

it('discovers current broadcasts directly instead of depending on archived uploads', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [{ id: { videoId: row.id } }] })).mockResolvedValueOnce(Response.json({ items: [row] }))
  expect((await fetchLiveVideo('key', '2026-11-22', '1pm', fetcher))?.status).toBe('live')
  expect(String(fetcher.mock.calls[0][0])).toContain('q=22.11.2026')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('revalidates a cached identity with one videos call and no discovery search', async () => {
 vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
 const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [row] }))
 const observe = vi.fn()
 expect((await fetchLiveVideo('key', '2026-11-22', '1pm', fetcher, row.id, observe))?.videoId).toBe(row.id)
 expect(fetcher).toHaveBeenCalledTimes(1)
 expect(String(fetcher.mock.calls[0][0])).toContain('/videos?')
 expect(observe).toHaveBeenCalledWith('videos')
})

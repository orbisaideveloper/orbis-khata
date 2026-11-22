import { expect, it } from 'vitest'
import { parseLiveVideo } from './live-client'
const draw = { date: '2026-11-22', slot: '1pm' as const }
const now = new Date('2026-11-22T07:32:00Z')
const row = { ...draw, videoId: 'abcdefghijk', checkedAt: now.toISOString(), status: 'live', actualStart: '2026-11-22T07:31:00Z', scheduledStart: null }
it('rejects stale, future, wrong-draw and malformed metadata before opening a player', () => {
  expect(parseLiveVideo(row, draw, now)).toEqual(row)
  for (const change of [{ date: '2026-11-21' }, { slot: '6pm' }, { videoId: 'https://evil.test' }, { checkedAt: '2026-11-22T07:29:00Z' }, { checkedAt: '2026-11-22T08:00:00Z' }, { actualStart: null }, { status: 'unknown' }]) expect(parseLiveVideo({ ...row, ...change }, draw, now)).toBeNull()
})

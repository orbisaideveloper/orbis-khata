import type { LiveVideo } from './live-provider'
import type { DrawSlot } from './result-data'
import { liveChannel } from './live-channel'
import { readTicketText } from './ticket'

export function parseLiveVideo(value: unknown, draw: { date: string; slot: DrawSlot }, now = new Date()): LiveVideo | null {
  const row = value as LiveVideo | null
  if (row?.date !== draw.date || row.slot !== draw.slot || !/^[\w-]{11}$/.test(row.videoId) || !['live', 'upcoming', 'completed'].includes(row.status)) return null
  const age = now.getTime() - Date.parse(row.checkedAt)
  if (!Number.isFinite(age) || age < 0 || age > 29 * 86400000) return null
  if (row.channelId && row.channelId !== liveChannel) return null
  if (row.status === 'live' && (!row.actualStart || !Number.isFinite(Date.parse(row.actualStart)) || Date.parse(row.actualStart) > now.getTime())) return null
  return row
}
export async function getLiveVideo(draw: { date: string; slot: DrawSlot }, signal: AbortSignal) {
  const base = import.meta.env.VITE_KHATA_DATA_URL as string | undefined
  if (!base) return null
  const url = new URL(base)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
  const response = await fetch(new URL('orbis-lottery-live', url), { signal, credentials: 'omit', cache: 'default', redirect: 'error' })
  if (!response.ok) throw new Error('LIVE_UNAVAILABLE')
  const body = JSON.parse(await readTicketText(response.body, 4096))
  if (body.date !== draw.date || body.slot !== draw.slot) return null
  return parseLiveVideo(body.video, draw)
}

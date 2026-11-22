import { indiaDate, type DrawSlot } from './result-data.ts'
import { readTicketText } from './ticket.ts'

import { liveChannel } from './live-channel.ts'
export type LiveVideo = { date: string; slot: DrawSlot; videoId: string; status: 'live' | 'upcoming' | 'completed'; checkedAt: string; scheduledStart: string | null; actualStart: string | null }
type Video = { id?: string; snippet?: { channelId?: string; title?: string; liveBroadcastContent?: string }; status?: { embeddable?: boolean; privacyStatus?: string }; liveStreamingDetails?: { scheduledStartTime?: string; actualStartTime?: string; actualEndTime?: string } }

export function selectLiveVideo(items: Video[], date: string, slot: DrawSlot, now: Date): LiveVideo | null {
  const selected: LiveVideo[] = []
  for (const row of items) {
    const title = row.snippet?.title?.toUpperCase() ?? ''
    const dates = title.match(/\b\d{2}\.\d{2}\.\d{4}\b/g)
    const times = title.match(/\b[168]\s*PM\b/g)?.map(value => value.replace(/\s/g, '').toLowerCase())
    if (row.snippet?.channelId !== liveChannel || !/^[\w-]{11}$/.test(row.id ?? '') || row.status?.embeddable !== true || row.status.privacyStatus !== 'public') continue
    if (!dates?.length || dates.some(value => value.split('.').reverse().join('-') !== date) || !times?.length || times.some(value => value !== slot)) continue
    const status = broadcastStatus(row, now)
    if (!status) continue
    const actualStart = row.liveStreamingDetails?.actualStartTime ?? null
    const scheduledStart = row.liveStreamingDetails?.scheduledStartTime ?? null
    const start = actualStart ?? scheduledStart!
    if (indiaDate(new Date(start)) !== date) continue
    const target = Date.parse(date + 'T' + { '1pm': '13', '6pm': '18', '8pm': '20' }[slot] + ':00:00+05:30')
    if (Date.parse(start) < target - 15 * 60000 || Date.parse(start) > target + 30 * 60000) continue
    selected.push({ date, slot, videoId: row.id!, status, checkedAt: now.toISOString(), scheduledStart, actualStart })
  }
  // Multiple conflicting candidates must never silently choose the wrong draw.
  return selected.length === 1 ? selected[0] : null
}

function broadcastStatus(row: Video, now: Date): LiveVideo['status'] | null {
    const details = row.liveStreamingDetails
    const actualStart = details?.actualStartTime ?? null, scheduledStart = details?.scheduledStartTime ?? null
    const actual = actualStart ? Date.parse(actualStart) : NaN
    let status: LiveVideo['status']
    if (details?.actualEndTime && Number.isFinite(actual) && Date.parse(details.actualEndTime) >= actual && Date.parse(details.actualEndTime) <= now.getTime()) status = 'completed'
    else if (row.snippet?.liveBroadcastContent === 'live' && Number.isFinite(actual) && actual <= now.getTime() && !details?.actualEndTime) status = 'live'
    else if (row.snippet?.liveBroadcastContent === 'upcoming' && scheduledStart && Number.isFinite(Date.parse(scheduledStart)) && !actualStart && !details?.actualEndTime) status = 'upcoming'
    else return null
    return status
}

export async function fetchLiveVideo(key: string, date: string, slot: DrawSlot, fetchImpl: typeof fetch = fetch): Promise<LiveVideo | null> {
  if (!key.trim()) throw new Error('LIVE_NOT_CONFIGURED')
  const api = async <T>(resource: string, query: Record<string, string>): Promise<{ items?: T[] }> => {
    const response = await fetchImpl('https://www.googleapis.com/youtube/v3/' + resource + '?' + new URLSearchParams(query), { headers: { 'x-goog-api-key': key, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error(response.status === 403 ? 'LIVE_PROVIDER_LIMIT' : 'LIVE_PROVIDER_UNAVAILABLE')
    return JSON.parse(await readTicketText(response.body, 65536))
  }
  const target = Date.parse(date + 'T' + { '1pm': '13', '6pm': '18', '8pm': '20' }[slot] + ':00:00+05:30')
  const offset = Date.now() - target
  let ids: string[]
  if (offset >= -10 * 60000 && offset < 20 * 60000) {
    // Upcoming/current broadcasts may not yet be in the uploads playlist.
    // One search per shared minute, only in the three 30-minute draw windows.
    const found = await api<{ id?: { videoId?: string } }>('search', { part: 'snippet', channelId: liveChannel, type: 'video', eventType: offset < 0 ? 'upcoming' : 'live', maxResults: '10', fields: 'items(id/videoId)' })
    ids = found.items?.map(row => row.id?.videoId).filter((id): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id)) ?? []
  } else {
  const channel = await api<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>('channels', { part: 'contentDetails', id: liveChannel, fields: 'items(contentDetails/relatedPlaylists/uploads)' })
  const playlist = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!playlist || !/^[\w-]{10,64}$/.test(playlist)) throw new Error('LIVE_PROVIDER_INVALID')
  const uploads = await api<{ contentDetails?: { videoId?: string } }>('playlistItems', { part: 'contentDetails', playlistId: playlist, maxResults: '25', fields: 'items(contentDetails/videoId)' })
  ids = uploads.items?.map(row => row.contentDetails?.videoId).filter((id): id is string => typeof id === 'string' && /^[\w-]{11}$/.test(id)) ?? []
  }
  if (!ids.length) return null
  const videos = await api<Video>('videos', { part: 'snippet,status,liveStreamingDetails', id: ids.join(','), fields: 'items(id,snippet(channelId,title,liveBroadcastContent),status(embeddable,privacyStatus),liveStreamingDetails)' })
  return selectLiveVideo(videos.items ?? [], date, slot, new Date())
}

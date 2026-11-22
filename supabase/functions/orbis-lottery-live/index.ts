import { fetchLiveVideo } from '../../../src/lottery-results/live-provider.ts'
import { liveDraw } from '../../../src/lottery-results/live-draw.ts'
import { readTicketText } from '../../../src/lottery-results/ticket.ts'
const env = (name: string) => Deno.env.get(name) ?? ''
const allowed = (env('KHATA_ORIGINS') || 'https://orbis-khata.onrender.com').split(',').concat(['https://localhost', 'capacitor://localhost'])
async function rpc(name: string, body: object): Promise<unknown> {
  const response = await fetch(env('SUPABASE_URL') + '/rest/v1/rpc/' + name, { method: 'POST', signal: AbortSignal.timeout(5000), headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), authorization: 'Bearer ' + env('SUPABASE_SERVICE_ROLE_KEY'), 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error('LIVE_CACHE_UNAVAILABLE')
  return JSON.parse(await readTicketText(response.body, 4096))
}
Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? ''
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'public, max-age=15, s-maxage=15', 'content-type': 'application/json', vary: 'Origin' }
  if (origin && !allowed.includes(origin)) return new Response(null, { status: 403 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'GET' || new URL(request.url).search) return new Response(null, { status: 400, headers })
  const draw = liveDraw(new Date())
  try {
    const claim = await rpc('lottery_live_draw_claim', { p_date: draw.date, p_slot: draw.slot }) as { state?: string; lease?: string; payload?: unknown }
    if (claim.state === 'wait') return Response.json({ ...draw, video: claim.payload ?? null }, { headers })
    if (claim.state !== 'claim' || !claim.lease) throw new Error('LIVE_CACHE_INVALID')
    let video = null, failed = false
    let searches = 0, verifications = 0, units = 0
    const cached = claim.payload as { videoId?: string } | null
    const observe = (resource: string) => { units++; if (resource === 'search') searches++; if (resource === 'videos') verifications++ }
    try { video = await fetchLiveVideo(env('YOUTUBE_DATA_API_KEY'), draw.date, draw.slot, fetch, cached?.videoId, observe) }
    catch (error) { failed = true; console.error('LOTTERY_LIVE_FAILURE', { code: error instanceof Error ? error.message : 'LIVE_UNKNOWN' }) }
    const saved = await rpc('lottery_live_draw_finish', { p_date: draw.date, p_slot: draw.slot, p_lease: claim.lease, p_payload: video, p_failed: failed, p_search: searches, p_verify: verifications, p_units: units })
    console.info('LOTTERY_LIVE_CACHE', { date: draw.date, slot: draw.slot, searches, verifications, estimatedUnits: units, failed })
    return Response.json({ ...draw, video: saved ?? claim.payload ?? null }, { headers })
  } catch {
    console.error('LOTTERY_LIVE_FAILURE', { code: 'LIVE_CACHE_UNAVAILABLE' })
    return Response.json({ ...draw, video: null }, { status: 503, headers: { ...headers, 'cache-control': 'no-store' } })
  }
})

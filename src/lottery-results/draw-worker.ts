import { parseTicket } from './ticket.ts'
import type { DrawRpc } from './draw-store.ts'
import type { createDrawService } from './draw-service.ts'

export function createDrawWorker(rpc: DrawRpc, load: ReturnType<typeof createDrawService>) {
  return async (request: Request) => {
    const reply = (status: number, value: string) => new Response(JSON.stringify({ state: value }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    if (request.method !== 'POST' || request.headers.has('origin')) return reply(403, 'WORKER_DENIED')
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) return reply(401, 'WORKER_DENIED')
    try {
      if (await rpc('lottery_worker_authorized', { p_token: authorization.slice(7) }) !== true) return reply(403, 'WORKER_DENIED')
      const rows = await rpc('lottery_draw_candidates', {})
      if (!Array.isArray(rows) || rows.length > 1) throw new Error('WORKER_QUEUE_INVALID')
      for (const row of rows) {
        const draw = parseTicket({ date: row.date, slot: row.slot, series: '35B', number: '00000' })
        await load(draw.date, draw.slot, true)
      }
      return reply(200, rows.length ? 'CHECKED' : 'NO_PENDING_DRAW')
    } catch (error) {
      const code = error instanceof Error && ['TICKET_BUSY', 'DRAW_PENDING'].includes(error.message) ? error.message : 'WORKER_UNAVAILABLE'
      console.warn('LOTTERY_WORKER_RESULT', { code })
      return reply(code === 'WORKER_UNAVAILABLE' ? 503 : 202, code)
    }
  }
}

import { parseTicket, readTicketText } from './ticket.ts'

type Options = { origins: string[]; document: (date: string, slot: string) => Promise<{ date: string; slot: string; sambadUrl: string | null }> }
// Public result-link metadata only. Ticket verdicts still require central authentication.
export function createDocumentGateway(options: Options) {
  return async (request: Request) => {
    const origin = request.headers.get('origin') ?? ''
    const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' })
    const reply = (status: number, code: string) => new Response(JSON.stringify({ code }), { status, headers })
    if (!options.origins.includes(origin)) return reply(403, 'DOCUMENT_ORIGIN_DENIED')
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'POST, OPTIONS')
    headers.set('access-control-allow-headers', 'content-type')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, 'DOCUMENT_METHOD_DENIED')
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'DOCUMENT_INPUT_INVALID')
    let draw
    try {
      const input = JSON.parse(await readTicketText(request.body, 512))
      draw = parseTicket({ date: input.date, slot: input.slot, series: '35B', number: '00000' })
    } catch { return reply(400, 'DOCUMENT_INPUT_INVALID') }
    try {
      const result = await options.document(draw.date, draw.slot)
      // Never serialize additional properties from a private cache response.
      return new Response(JSON.stringify({ date: draw.date, slot: draw.slot, sambadUrl: result.sambadUrl }), { headers })
    } catch (error) {
      const busy = error instanceof Error && error.message === 'TICKET_BUSY'
      console.warn('LOTTERY_DOCUMENT_RESULT', { date: draw.date, slot: draw.slot, state: busy ? 'BUSY' : 'UNAVAILABLE' })
      if (busy) headers.set('retry-after', '30')
      return reply(busy ? 429 : 503, busy ? 'TICKET_BUSY' : 'DOCUMENT_UNAVAILABLE')
    }
  }
}
